"""Vision service: the vision-only core of Benchwatch.

The camera points straight down at the bench. A printed A3 mat carries four
corner ArUco markers and four labeled zones (zones 1-3 are reagent home zones,
zone 4 is the target where reagents are added). This module:

1. Reads frames from a :class:`FrameSource` (a real camera or, in tests, a
   list of synthetic numpy frames). The device sits behind the interface so the
   module imports and unit-tests with no camera present.
2. Detects the four corner ArUco markers and rectifies the frame to a fixed
   top-down canvas (:func:`detect_markers`, :func:`rectify`). With fewer than
   four markers it returns ``None`` so the UI can say "mat not detected" instead
   of crashing.
3. Checks each home zone for its calibrated cap color using HSV thresholds
   (:func:`color_presence`), and samples per-reagent HSV ranges on-screen so the
   detection survives the venue's lighting (:func:`calibrate`).
4. Runs a deterministic per-reagent presence state machine
   (:class:`DetectionStateMachine`) that emits ``bottle_lifted`` (color absent
   from its home zone for more than ~0.5s), ``bottle_over_target`` (color seen
   over zone 4) and ``bottle_returned`` (color back home). Every emitted event
   is an :class:`app.events.Event` with ``source="vision"`` and the reagent key
   in ``payload["bottle"]`` so the deterministic engine can consume it directly.

Design invariants honored here (see the steering doc):

* Vision-only core: everything here works from vision alone. No audio, no wake
  words. The LLM is never involved.
* Hardware behind an interface: :class:`CameraFrameSource` opens the device
  lazily, so importing this module and constructing the service needs no camera.
* MediaPipe Hands is strictly optional: the import is guarded and the core
  detection works without it. When available it can gate lifts to reduce
  shadow false positives.
* The clock is injected (a ``now()`` callable) so the >0.5s lift timing is
  deterministic in tests with no real sleeps.
"""

from __future__ import annotations

import json
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np

try:  # OpenCV is required for the real service; keep import failures informative.
    import cv2
except Exception as exc:  # pragma: no cover - environment guard
    cv2 = None  # type: ignore[assignment]
    _CV2_IMPORT_ERROR: Optional[Exception] = exc
else:
    _CV2_IMPORT_ERROR = None

from .events import Event
from .protocol import Protocol

# MediaPipe Hands is OPTIONAL. The core detection must work without it, so the
# import is guarded and failures are swallowed. When present it can be used to
# confirm a hand is involved in a lift and reduce shadow false positives.
try:  # pragma: no cover - optional dependency, availability varies by sandbox
    import mediapipe as _mediapipe  # noqa: F401

    MEDIAPIPE_AVAILABLE = True
except Exception:  # pragma: no cover
    _mediapipe = None  # type: ignore[assignment]
    MEDIAPIPE_AVAILABLE = False


# --------------------------------------------------------------------------- #
# Event type constants (consumed by the deterministic engine, FEAT-002).
# --------------------------------------------------------------------------- #
EV_BOTTLE_LIFTED = "bottle_lifted"
EV_BOTTLE_OVER_TARGET = "bottle_over_target"
EV_BOTTLE_RETURNED = "bottle_returned"

# The reagent/bottle id is carried under this payload key (engine contract).
PAYLOAD_BOTTLE_KEY = "bottle"


# --------------------------------------------------------------------------- #
# Frame sources (the camera sits behind this interface).
# --------------------------------------------------------------------------- #
class FrameSource(ABC):
    """Abstract source of BGR frames.

    ``read()`` returns a single frame as a numpy array (HxWx3, BGR, the OpenCV
    convention) or ``None`` when no frame is currently available. Implementations
    must be safe to construct without a device attached.
    """

    @abstractmethod
    def read(self) -> Optional[np.ndarray]:
        """Return the next frame, or ``None`` if none is available."""

    def release(self) -> None:  # pragma: no cover - default is a no-op
        """Release any underlying device. Safe to call more than once."""


class CameraFrameSource(FrameSource):
    """A :class:`FrameSource` backed by an OpenCV ``VideoCapture``.

    The device is opened lazily on the first :meth:`read`, so importing this
    module and constructing the source require no camera. If the device cannot
    be opened (the sandbox has none), :meth:`read` returns ``None`` rather than
    raising, so the service degrades to a "no frame" status.
    """

    def __init__(self, index: int = 0, *, api_preference: Optional[int] = None) -> None:
        self.index = index
        self.api_preference = api_preference
        self._capture = None  # type: ignore[assignment]
        self._open_failed = False

    def _ensure_open(self) -> bool:
        if self._capture is not None:
            return True
        if self._open_failed or cv2 is None:
            return False
        try:
            if self.api_preference is not None:
                capture = cv2.VideoCapture(self.index, self.api_preference)
            else:
                capture = cv2.VideoCapture(self.index)
        except Exception:
            self._open_failed = True
            return False
        if not capture.isOpened():
            self._open_failed = True
            try:
                capture.release()
            except Exception:
                pass
            return False
        self._capture = capture
        return True

    def read(self) -> Optional[np.ndarray]:
        if not self._ensure_open():
            return None
        ok, frame = self._capture.read()  # type: ignore[union-attr]
        if not ok or frame is None:
            return None
        return frame

    def release(self) -> None:
        if self._capture is not None:
            try:
                self._capture.release()
            except Exception:
                pass
            self._capture = None


class ArrayFrameSource(FrameSource):
    """A :class:`FrameSource` that yields a fixed sequence of supplied frames.

    Used by tests (and replay) to drive the pipeline deterministically with
    synthetic numpy frames and no camera. Once the supplied frames are
    exhausted, :meth:`read` returns ``None``. Set ``loop=True`` to cycle.
    """

    def __init__(self, frames: Sequence[np.ndarray], *, loop: bool = False) -> None:
        self._frames: List[np.ndarray] = list(frames)
        self._loop = loop
        self._index = 0

    def read(self) -> Optional[np.ndarray]:
        if not self._frames:
            return None
        if self._index >= len(self._frames):
            if not self._loop:
                return None
            self._index = 0
        frame = self._frames[self._index]
        self._index += 1
        return frame

    def append(self, frame: np.ndarray) -> None:
        """Add another frame to the queue (handy for streaming tests)."""
        self._frames.append(frame)


# ReplayFrameSource is an alias: replaying a recorded session is exactly an
# array of frames fed back through the pipeline.
ReplayFrameSource = ArrayFrameSource


# --------------------------------------------------------------------------- #
# Mat detection and rectification (ArUco).
# --------------------------------------------------------------------------- #
# The default A3 mat uses ArUco dictionary DICT_4X4_50 with corner ids 0..3
# placed top-left, top-right, bottom-right, bottom-left. The rectified canvas
# keeps A3 landscape aspect (420 x 297 mm) scaled up for comfortable zone ROIs.
DEFAULT_ARUCO_DICT = "DICT_4X4_50"
DEFAULT_CORNER_IDS: Tuple[int, int, int, int] = (0, 1, 2, 3)
DEFAULT_CANVAS_SIZE: Tuple[int, int] = (840, 594)  # (width, height), A3 2:sqrt ~1.414


def _require_cv2() -> None:
    if cv2 is None:  # pragma: no cover - environment guard
        raise RuntimeError(
            "OpenCV (cv2) is required for mat detection but failed to import: "
            f"{_CV2_IMPORT_ERROR!r}"
        )


def _get_aruco_dictionary(name: str = DEFAULT_ARUCO_DICT):
    _require_cv2()
    dict_id = getattr(cv2.aruco, name)
    # Support both the >=4.7 (getPredefinedDictionary) and the legacy API.
    if hasattr(cv2.aruco, "getPredefinedDictionary"):
        return cv2.aruco.getPredefinedDictionary(dict_id)
    return cv2.aruco.Dictionary_get(dict_id)  # pragma: no cover - legacy path


def detect_markers(
    frame: np.ndarray, *, aruco_dict: str = DEFAULT_ARUCO_DICT
) -> Optional[Dict[int, np.ndarray]]:
    """Detect ArUco markers in a BGR frame.

    Returns a mapping ``{marker_id: corners}`` where ``corners`` is a ``(4, 2)``
    float array of the marker's corner pixel coordinates, or ``None`` if the
    frame is empty / unusable. An empty mapping ``{}`` is returned when the frame
    is valid but no markers were found.
    """
    _require_cv2()
    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return None

    if frame.ndim == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    else:
        gray = frame

    dictionary = _get_aruco_dictionary(aruco_dict)
    if hasattr(cv2.aruco, "ArucoDetector"):
        detector = cv2.aruco.ArucoDetector(
            dictionary, cv2.aruco.DetectorParameters()
        )
        corners, ids, _ = detector.detectMarkers(gray)
    else:  # pragma: no cover - legacy OpenCV path
        params = cv2.aruco.DetectorParameters_create()
        corners, ids, _ = cv2.aruco.detectMarkers(
            gray, dictionary, parameters=params
        )

    result: Dict[int, np.ndarray] = {}
    if ids is None:
        return result
    for marker_id, corner in zip(ids.flatten().tolist(), corners):
        result[int(marker_id)] = np.asarray(corner, dtype=np.float32).reshape(4, 2)
    return result


def _marker_center(corners: np.ndarray) -> np.ndarray:
    return corners.mean(axis=0)


def rectify(
    frame: np.ndarray,
    markers: Optional[Dict[int, np.ndarray]] = None,
    *,
    corner_ids: Tuple[int, int, int, int] = DEFAULT_CORNER_IDS,
    canvas_size: Tuple[int, int] = DEFAULT_CANVAS_SIZE,
    aruco_dict: str = DEFAULT_ARUCO_DICT,
) -> Optional[np.ndarray]:
    """Warp ``frame`` to a top-down view of the mat.

    If ``markers`` is not supplied it is detected from the frame. The four
    corner markers (ids given by ``corner_ids``, ordered top-left, top-right,
    bottom-right, bottom-left) define a homography onto the fixed ``canvas_size``
    canvas. Returns ``None`` (never raises) when fewer than four of the required
    corner markers are present, so the UI can prompt "mat not detected".
    """
    _require_cv2()
    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return None

    if markers is None:
        markers = detect_markers(frame, aruco_dict=aruco_dict)
    if markers is None:
        return None

    if not all(cid in markers for cid in corner_ids):
        # Fewer than four corner markers visible -> mat not detected.
        return None

    width, height = canvas_size
    # Use the marker corner nearest the mat corner for a tight rectification:
    # top-left marker -> its top-left corner, etc. The marker corner order from
    # OpenCV is [TL, TR, BR, BL].
    tl = markers[corner_ids[0]][0]
    tr = markers[corner_ids[1]][1]
    br = markers[corner_ids[2]][2]
    bl = markers[corner_ids[3]][3]
    src = np.array([tl, tr, br, bl], dtype=np.float32)
    dst = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    transform = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(frame, transform, (width, height))


# --------------------------------------------------------------------------- #
# Zone layout.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Zone:
    """A labeled rectangle on the rectified canvas, in normalized [0,1] coords.

    ``(x, y)`` is the top-left corner; ``(w, h)`` the width and height, all as
    fractions of the canvas so the layout is resolution-independent.
    """

    id: int
    x: float
    y: float
    w: float
    h: float

    def pixel_rect(self, canvas_size: Tuple[int, int]) -> Tuple[int, int, int, int]:
        """Return ``(x0, y0, x1, y1)`` pixel bounds for a given canvas size."""
        width, height = canvas_size
        x0 = int(round(self.x * width))
        y0 = int(round(self.y * height))
        x1 = int(round((self.x + self.w) * width))
        y1 = int(round((self.y + self.h) * height))
        x0, x1 = max(0, min(x0, width)), max(0, min(x1, width))
        y0, y1 = max(0, min(y0, height)), max(0, min(y1, height))
        return x0, y0, x1, y1

    def roi(self, canvas: np.ndarray) -> np.ndarray:
        """Return the region-of-interest sub-image for this zone."""
        h, w = canvas.shape[:2]
        x0, y0, x1, y1 = self.pixel_rect((w, h))
        return canvas[y0:y1, x0:x1]


# Default A3 mat layout: three reagent home zones along the top row, the target
# zone centered in the lower half. These match a printed mat and are
# configurable via ZoneLayout so a different print just needs new rectangles.
DEFAULT_ZONES: Dict[int, Zone] = {
    1: Zone(1, 0.05, 0.08, 0.26, 0.34),
    2: Zone(2, 0.37, 0.08, 0.26, 0.34),
    3: Zone(3, 0.69, 0.08, 0.26, 0.34),
    4: Zone(4, 0.30, 0.55, 0.40, 0.38),
}


@dataclass
class ZoneLayout:
    """The set of labeled zones on the mat, keyed by zone id."""

    zones: Dict[int, Zone] = field(
        default_factory=lambda: dict(DEFAULT_ZONES)
    )

    def zone(self, zone_id: int) -> Zone:
        return self.zones[zone_id]

    def __contains__(self, zone_id: int) -> bool:
        return zone_id in self.zones


# --------------------------------------------------------------------------- #
# HSV color ranges and per-zone color presence.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class HSVRange:
    """An inclusive HSV threshold range (OpenCV HSV: H 0-179, S/V 0-255).

    Hue wrap-around (for red, which straddles 0/179) is supported: when
    ``lower[0] > upper[0]`` the range is treated as two bands [lower_h, 179] and
    [0, upper_h].
    """

    lower: Tuple[int, int, int]
    upper: Tuple[int, int, int]

    def mask(self, hsv: np.ndarray) -> np.ndarray:
        """Return a uint8 0/255 mask of pixels inside this range."""
        _require_cv2()
        lo = np.array(self.lower, dtype=np.uint8)
        hi = np.array(self.upper, dtype=np.uint8)
        if self.lower[0] <= self.upper[0]:
            return cv2.inRange(hsv, lo, hi)
        # Hue wraps around the 0/179 boundary: OR two bands together.
        lo1 = np.array([self.lower[0], self.lower[1], self.lower[2]], dtype=np.uint8)
        hi1 = np.array([179, self.upper[1], self.upper[2]], dtype=np.uint8)
        lo2 = np.array([0, self.lower[1], self.lower[2]], dtype=np.uint8)
        hi2 = np.array([self.upper[0], self.upper[1], self.upper[2]], dtype=np.uint8)
        return cv2.bitwise_or(cv2.inRange(hsv, lo1, hi1), cv2.inRange(hsv, lo2, hi2))

    def to_dict(self) -> Dict[str, List[int]]:
        return {"lower": list(self.lower), "upper": list(self.upper)}

    @classmethod
    def from_dict(cls, data: Dict[str, Sequence[int]]) -> "HSVRange":
        return cls(
            lower=tuple(int(v) for v in data["lower"]),  # type: ignore[arg-type]
            upper=tuple(int(v) for v in data["upper"]),  # type: ignore[arg-type]
        )


# Sensible default cap-color HSV ranges keyed by the protocol's ``cap_color``
# names. Calibration refines these per reagent under the venue lighting, but
# these let the service run before a calibration pass.
DEFAULT_COLOR_RANGES: Dict[str, HSVRange] = {
    "blue": HSVRange((100, 80, 40), (130, 255, 255)),
    "yellow": HSVRange((20, 80, 80), (35, 255, 255)),
    "red": HSVRange((170, 80, 60), (10, 255, 255)),  # wraps the hue boundary
    "green": HSVRange((40, 60, 40), (85, 255, 255)),
    "orange": HSVRange((10, 100, 80), (20, 255, 255)),
    "purple": HSVRange((130, 60, 40), (160, 255, 255)),
}

# A color is "present" in a zone when at least this fraction of its pixels fall
# inside the HSV range.
DEFAULT_PRESENCE_THRESHOLD = 0.08


def color_presence(roi: np.ndarray, hsv_range: HSVRange) -> float:
    """Return the fraction (0..1) of ``roi`` pixels inside ``hsv_range``.

    ``roi`` is a BGR sub-image. An empty ROI scores 0.0.
    """
    _require_cv2()
    if roi is None or roi.size == 0:
        return 0.0
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    mask = hsv_range.mask(hsv)
    total = mask.shape[0] * mask.shape[1]
    if total == 0:
        return 0.0
    return float(np.count_nonzero(mask)) / float(total)


def color_present(
    roi: np.ndarray,
    hsv_range: HSVRange,
    *,
    threshold: float = DEFAULT_PRESENCE_THRESHOLD,
) -> bool:
    """Return ``True`` when the color's presence score exceeds ``threshold``."""
    return color_presence(roi, hsv_range) >= threshold


# --------------------------------------------------------------------------- #
# On-screen color calibration.
# --------------------------------------------------------------------------- #
def _dominant_hsv(roi: np.ndarray) -> Tuple[int, int, int]:
    """Return the median HSV of an ROI (robust to a few stray pixels)."""
    _require_cv2()
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    med = np.median(hsv, axis=0)
    return int(med[0]), int(med[1]), int(med[2])


def _range_from_sample(
    h: int,
    s: int,
    v: int,
    *,
    h_tol: int = 12,
    s_tol: int = 70,
    v_tol: int = 70,
) -> HSVRange:
    """Build an HSV range around a sampled color with tolerances, with hue wrap."""
    lo_h = (h - h_tol) % 180
    hi_h = (h + h_tol) % 180
    lo_s = max(0, s - s_tol)
    lo_v = max(0, v - v_tol)
    hi_s = min(255, s + s_tol)
    hi_v = min(255, v + v_tol)
    # When the hue tolerance does not wrap, keep lo_h <= hi_h so inRange works
    # as a single band; otherwise HSVRange.mask handles the wrap.
    if h - h_tol < 0 or h + h_tol >= 180:
        # Wraps the boundary: encode as lower_h > upper_h for HSVRange.mask.
        return HSVRange((lo_h, lo_s, lo_v), (hi_h, hi_s, hi_v))
    return HSVRange((lo_h, lo_s, lo_v), (hi_h, hi_s, hi_v))


def calibrate(
    frame: np.ndarray,
    protocol: Protocol,
    *,
    layout: Optional[ZoneLayout] = None,
    rectified: bool = False,
    h_tol: int = 12,
    s_tol: int = 70,
    v_tol: int = 70,
) -> Optional[Dict[str, HSVRange]]:
    """Sample each reagent's cap color from its home zone.

    Given a frame (raw or already-rectified) and the protocol, this rectifies if
    needed, reads the dominant HSV of each reagent's home-zone ROI, and returns
    ``{reagent_key: HSVRange}`` with a tolerance band around each sample. This is
    the on-screen calibration step that absorbs venue-lighting differences.

    Returns ``None`` if the mat cannot be rectified (so the UI can ask the user
    to reposition the camera before calibrating).
    """
    layout = layout or ZoneLayout()
    canvas = frame if rectified else rectify(frame)
    if canvas is None:
        return None

    ranges: Dict[str, HSVRange] = {}
    for key, reagent in protocol.reagents.items():
        if reagent.zone not in layout:
            continue
        roi = layout.zone(reagent.zone).roi(canvas)
        if roi.size == 0:
            continue
        h, s, v = _dominant_hsv(roi)
        ranges[key] = _range_from_sample(
            h, s, v, h_tol=h_tol, s_tol=s_tol, v_tol=v_tol
        )
    return ranges


def save_calibration(
    ranges: Dict[str, HSVRange], path: Union[str, Path]
) -> Path:
    """Persist calibrated HSV ranges to a JSON file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = {key: rng.to_dict() for key, rng in ranges.items()}
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return p


def load_calibration(path: Union[str, Path]) -> Dict[str, HSVRange]:
    """Load calibrated HSV ranges previously saved with :func:`save_calibration`."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {key: HSVRange.from_dict(value) for key, value in data.items()}


# --------------------------------------------------------------------------- #
# Detection state machine.
# --------------------------------------------------------------------------- #
# How long a reagent's color must be absent from its home zone before we call it
# a lift (seconds). Kept just under a human's pick-up motion to avoid flicker.
DEFAULT_LIFT_DELAY_S = 0.5


@dataclass
class _ReagentState:
    """Mutable per-reagent tracking state for the detection machine."""

    present_home: bool = True
    lifted: bool = False
    over_target: bool = False
    absent_since: Optional[float] = None


class DetectionStateMachine:
    """Turns per-frame color observations into ordered vision events.

    Call :meth:`observe` once per frame with the set of zones each reagent's
    color is currently seen in (home zone and/or the target zone). The machine
    tracks presence over time and emits, as :class:`app.events.Event` objects:

    * ``bottle_lifted`` once a reagent's color has been absent from its home
      zone for longer than ``lift_delay_s``;
    * ``bottle_over_target`` the first frame its color is seen over the target
      zone while lifted;
    * ``bottle_returned`` when its color reappears in its home zone.

    The clock is injected (``now`` callable) so the >0.5s lift delay is
    deterministic in tests. Nothing here sleeps or reads the wall clock directly.
    MediaPipe Hands gating is optional: when ``require_hand`` is set and a hand
    presence probe is supplied, a lift is only confirmed when a hand is present.
    """

    def __init__(
        self,
        protocol: Protocol,
        *,
        target_zone: Optional[int] = None,
        lift_delay_s: float = DEFAULT_LIFT_DELAY_S,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.protocol = protocol
        self.target_zone = (
            target_zone if target_zone is not None else protocol.target_zone
        )
        self.lift_delay_s = lift_delay_s
        self.clock = clock
        self._state: Dict[str, _ReagentState] = {
            key: _ReagentState() for key in protocol.reagents
        }

    def home_zone(self, reagent_key: str) -> int:
        return self.protocol.reagents[reagent_key].zone

    def all_home(self) -> bool:
        """True when every reagent's color is currently in its home zone.

        Used by the session-start precondition (FEAT-004): the first step is
        only allowed once every reagent is confirmed home.
        """
        return all(st.present_home and not st.lifted for st in self._state.values())

    def observe(
        self,
        presence: Dict[str, set],
        *,
        now: Optional[float] = None,
        hand_present: Optional[bool] = None,
    ) -> List[Event]:
        """Feed one frame's observations and return any events produced.

        ``presence`` maps each reagent key to the set of zone ids its color is
        currently detected in this frame (e.g. ``{"buffer_a": {1}}`` means Buffer
        A's blue cap is seen in home zone 1). ``now`` overrides the injected
        clock for this call (tests pass an explicit timestamp). ``hand_present``
        optionally feeds a MediaPipe Hands probe result for this frame.
        """
        ts = now if now is not None else self.clock()
        events: List[Event] = []

        for key, state in self._state.items():
            zones = presence.get(key, set())
            home = self.home_zone(key)
            in_home = home in zones
            in_target = self.target_zone in zones

            if in_home:
                # Color is home. Resolve a prior lift as a return.
                if state.lifted:
                    events.append(
                        self._event(EV_BOTTLE_RETURNED, key, ts)
                    )
                state.present_home = True
                state.lifted = False
                state.over_target = False
                state.absent_since = None
                continue

            # Not in its home zone this frame.
            if state.present_home and state.absent_since is None:
                state.absent_since = ts
            state.present_home = False

            if not state.lifted:
                absent_for = (
                    ts - state.absent_since if state.absent_since is not None else 0.0
                )
                hand_ok = hand_present is None or hand_present
                if absent_for >= self.lift_delay_s and hand_ok:
                    state.lifted = True
                    events.append(self._event(EV_BOTTLE_LIFTED, key, ts))

            if state.lifted and in_target and not state.over_target:
                state.over_target = True
                events.append(self._event(EV_BOTTLE_OVER_TARGET, key, ts))

        return events

    def _event(self, event_type: str, reagent_key: str, ts: float) -> Event:
        reagent = self.protocol.reagents.get(reagent_key)
        payload = {PAYLOAD_BOTTLE_KEY: reagent_key}
        if reagent is not None:
            payload["label"] = reagent.label
            payload["cap_color"] = reagent.cap_color
        return Event(source="vision", type=event_type, payload=payload, timestamp=ts)


# --------------------------------------------------------------------------- #
# Vision service (frame loop).
# --------------------------------------------------------------------------- #
@dataclass
class VisionStatus:
    """A lightweight status snapshot the UI can render."""

    state: str = "starting"  # starting | no_frame | mat_not_detected | tracking
    detail: str = ""


class VisionService:
    """Runs the frame loop and drives the detection state machine.

    The service reads frames from a :class:`FrameSource` at ~``fps`` frames a
    second, rectifies the mat, scores each home zone and the target zone for
    each reagent's calibrated color, and feeds the per-frame presence into a
    :class:`DetectionStateMachine`. Events it produces are pushed to the
    ``on_event`` callback the backend wires to the engine and WebSocket.

    The loop is startable/stoppable and never crashes when no camera or frame is
    available: it reports ``no_frame`` / ``mat_not_detected`` status instead.
    """

    def __init__(
        self,
        protocol: Protocol,
        source: FrameSource,
        *,
        on_event: Optional[Callable[[Event], None]] = None,
        color_ranges: Optional[Dict[str, HSVRange]] = None,
        layout: Optional[ZoneLayout] = None,
        fps: float = 15.0,
        presence_threshold: float = DEFAULT_PRESENCE_THRESHOLD,
        lift_delay_s: float = DEFAULT_LIFT_DELAY_S,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
        use_hands: bool = False,
    ) -> None:
        self.protocol = protocol
        self.source = source
        self.on_event = on_event
        self.layout = layout or ZoneLayout()
        self.fps = max(1.0, float(fps))
        self.presence_threshold = presence_threshold
        self.clock = clock
        self._sleep = sleep
        self.use_hands = use_hands and MEDIAPIPE_AVAILABLE
        self.status = VisionStatus()
        self.machine = DetectionStateMachine(
            protocol, lift_delay_s=lift_delay_s, clock=clock
        )
        self.color_ranges: Dict[str, HSVRange] = (
            dict(color_ranges) if color_ranges else self._default_ranges()
        )
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def _default_ranges(self) -> Dict[str, HSVRange]:
        ranges: Dict[str, HSVRange] = {}
        for key, reagent in self.protocol.reagents.items():
            rng = DEFAULT_COLOR_RANGES.get(reagent.cap_color.lower())
            if rng is not None:
                ranges[key] = rng
        return ranges

    def set_calibration(self, ranges: Dict[str, HSVRange]) -> None:
        """Replace the active per-reagent HSV ranges (after a calibration pass)."""
        self.color_ranges.update(ranges)

    def calibrate_from_frame(self, frame: np.ndarray, **kwargs) -> Optional[
        Dict[str, HSVRange]
    ]:
        """Run :func:`calibrate` on a frame and adopt the result if successful."""
        ranges = calibrate(frame, self.protocol, layout=self.layout, **kwargs)
        if ranges:
            self.set_calibration(ranges)
        return ranges

    def all_reagents_home(self) -> bool:
        """Expose the state machine's all-home check (session-start gate)."""
        return self.machine.all_home()

    def _presence_from_canvas(self, canvas: np.ndarray) -> Dict[str, set]:
        """Score every reagent in its home zone and the target zone."""
        presence: Dict[str, set] = {}
        target = self.protocol.target_zone
        target_zone = self.layout.zone(target) if target in self.layout else None
        for key, reagent in self.protocol.reagents.items():
            rng = self.color_ranges.get(key)
            if rng is None:
                presence[key] = set()
                continue
            zones: set = set()
            if reagent.zone in self.layout:
                roi = self.layout.zone(reagent.zone).roi(canvas)
                if color_present(roi, rng, threshold=self.presence_threshold):
                    zones.add(reagent.zone)
            if target_zone is not None:
                roi = target_zone.roi(canvas)
                if color_present(roi, rng, threshold=self.presence_threshold):
                    zones.add(target)
            presence[key] = zones
        return presence

    def process_frame(self, frame: Optional[np.ndarray]) -> List[Event]:
        """Process a single frame end-to-end, updating status, return events.

        Safe to call directly (used by tests and the loop). Never raises on a
        missing frame or an undetected mat; it updates :attr:`status` instead.
        """
        if frame is None:
            self.status = VisionStatus("no_frame", "waiting for a camera frame")
            return []
        canvas = rectify(frame)
        if canvas is None:
            self.status = VisionStatus(
                "mat_not_detected", "need all four corner markers visible"
            )
            return []
        presence = self._presence_from_canvas(canvas)
        self.status = VisionStatus("tracking", "")
        return self.machine.observe(presence, now=self.clock())

    def _emit(self, events: List[Event]) -> None:
        if self.on_event is None:
            return
        for event in events:
            self.on_event(event)

    def step_once(self) -> List[Event]:
        """Read one frame, process it, emit any events, and return them."""
        frame = self.source.read()
        events = self.process_frame(frame)
        self._emit(events)
        return events

    def _run(self) -> None:
        period = 1.0 / self.fps
        while self._running:
            self.step_once()
            self._sleep(period)

    def start(self, *, threaded: bool = True) -> None:
        """Start the frame loop. When ``threaded`` runs in a background thread."""
        if self._running:
            return
        self._running = True
        self.status = VisionStatus("starting", "")
        if threaded:
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()
        else:  # pragma: no cover - blocking mode is for manual/CLI use only
            self._run()

    def stop(self) -> None:
        """Stop the frame loop and release the camera."""
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        try:
            self.source.release()
        except Exception:
            pass
