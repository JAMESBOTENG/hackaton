"""Device-independent unit tests for the vision service.

These tests exercise the vision pipeline with synthetic numpy frames and an
injected clock. No physical camera, microphone or display is used, so the suite
runs in the sandbox. Three strands are covered:

* HSV per-zone color presence on solid-color ROIs (present/absent).
* The lift / over-target / returned detection state machine, driven by a
  scripted sequence of per-frame observations and an injected clock so the
  >0.5s lift delay is deterministic.
* ArUco mat detection / rectification: the <4-marker branch returns ``None``
  (never crashes), and a positive rectify path built from generated markers.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.protocol import load_protocol
from app.vision import (
    ArrayFrameSource,
    CameraFrameSource,
    DEFAULT_CANVAS_SIZE,
    DEFAULT_CORNER_IDS,
    DetectionStateMachine,
    EV_BOTTLE_LIFTED,
    EV_BOTTLE_OVER_TARGET,
    EV_BOTTLE_RETURNED,
    HSVRange,
    VisionService,
    ZoneLayout,
    calibrate,
    color_present,
    color_presence,
    detect_markers,
    load_calibration,
    rectify,
    save_calibration,
)

import cv2  # available because the module imported

from pathlib import Path

PROTOCOL_PATH = Path(__file__).resolve().parents[1] / "protocols" / "demo_assay.yaml"


@pytest.fixture
def protocol():
    return load_protocol(PROTOCOL_PATH)


class Clock:
    """A manually-advanced monotonic clock for deterministic timing tests."""

    def __init__(self, start: float = 0.0) -> None:
        self.t = float(start)

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> float:
        self.t += dt
        return self.t


def solid_bgr(color_bgr, size=(60, 60)) -> np.ndarray:
    """Return a solid-color BGR image."""
    h, w = size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = color_bgr
    return img


# --------------------------------------------------------------------------- #
# HSV color presence.
# --------------------------------------------------------------------------- #
def test_color_presence_detects_matching_color():
    blue = solid_bgr((255, 0, 0))  # BGR blue
    blue_range = HSVRange((100, 80, 40), (130, 255, 255))
    assert color_presence(blue, blue_range) > 0.9
    assert color_present(blue, blue_range)


def test_color_presence_rejects_other_color():
    red = solid_bgr((0, 0, 255))  # BGR red
    blue_range = HSVRange((100, 80, 40), (130, 255, 255))
    assert color_presence(red, blue_range) < 0.05
    assert not color_present(red, blue_range)


def test_color_presence_empty_roi_is_zero():
    empty = np.zeros((0, 0, 3), dtype=np.uint8)
    assert color_presence(empty, HSVRange((0, 0, 0), (179, 255, 255))) == 0.0


def test_red_hsv_range_wraps_hue_boundary():
    red = solid_bgr((0, 0, 255))
    red_range = HSVRange((170, 80, 60), (10, 255, 255))  # wraps 0/179
    assert color_present(red, red_range)


# --------------------------------------------------------------------------- #
# Detection state machine.
# --------------------------------------------------------------------------- #
def test_state_machine_lift_over_target_returned_order(protocol):
    clock = Clock()
    machine = DetectionStateMachine(protocol, lift_delay_s=0.5, clock=clock)

    # Every frame scores all three home zones; the others stay home throughout.
    def frame(buffer_a_zones):
        return {"buffer_a": buffer_a_zones, "reagent_b": {2}, "stop": {3}}

    # buffer_a home zone is 1, target zone is 4.
    # Frame 1: present at home -> no event.
    events = machine.observe(frame({1}), now=clock.t)
    assert events == []

    # Color disappears from home (first absent frame starts the clock).
    clock.advance(0.2)
    events = machine.observe(frame(set()), now=clock.t)
    assert events == []

    # Past 0.5s absent (measured from the first absent frame) -> bottle_lifted.
    clock.advance(0.6)  # 0.6s since first seen absent
    events = machine.observe(frame(set()), now=clock.t)
    assert [e.type for e in events] == [EV_BOTTLE_LIFTED]
    assert events[0].source == "vision"
    assert events[0].payload["bottle"] == "buffer_a"
    assert events[0].timestamp == clock.t

    # Color appears over the target zone -> bottle_over_target.
    clock.advance(0.3)
    events = machine.observe(frame({4}), now=clock.t)
    assert [e.type for e in events] == [EV_BOTTLE_OVER_TARGET]
    assert events[0].payload["bottle"] == "buffer_a"

    # Color comes back home -> bottle_returned.
    clock.advance(0.3)
    events = machine.observe(frame({1}), now=clock.t)
    assert [e.type for e in events] == [EV_BOTTLE_RETURNED]
    assert events[0].payload["bottle"] == "buffer_a"


def test_state_machine_no_lift_before_delay(protocol):
    clock = Clock()
    machine = DetectionStateMachine(protocol, lift_delay_s=0.5, clock=clock)

    def frame(reagent_b_zones):
        return {"buffer_a": {1}, "reagent_b": reagent_b_zones, "stop": {3}}

    machine.observe(frame({2}), now=clock.t)
    # Absent but only briefly across several frames under 0.5s total.
    for dt in (0.1, 0.1, 0.1, 0.1):
        clock.advance(dt)
        events = machine.observe(frame(set()), now=clock.t)
        assert events == []
    # Now cross the threshold.
    clock.advance(0.2)
    events = machine.observe(frame(set()), now=clock.t)
    assert [e.type for e in events] == [EV_BOTTLE_LIFTED]


def test_state_machine_hand_gating_blocks_lift(protocol):
    clock = Clock()
    machine = DetectionStateMachine(protocol, lift_delay_s=0.5, clock=clock)

    def frame(stop_zones):
        return {"buffer_a": {1}, "reagent_b": {2}, "stop": stop_zones}

    machine.observe(frame({3}), now=clock.t)
    # First absent frame starts the absence clock.
    clock.advance(0.1)
    machine.observe(frame(set()), now=clock.t, hand_present=False)
    # Absent long enough now, but no hand present -> suppressed (shadow rejection).
    clock.advance(0.7)
    events = machine.observe(frame(set()), now=clock.t, hand_present=False)
    assert events == []
    # Hand appears -> lift confirmed.
    clock.advance(0.1)
    events = machine.observe(frame(set()), now=clock.t, hand_present=True)
    assert [e.type for e in events] == [EV_BOTTLE_LIFTED]


def test_all_home_precondition(protocol):
    clock = Clock()
    machine = DetectionStateMachine(protocol, lift_delay_s=0.5, clock=clock)
    # Initial state assumes all reagents home.
    assert machine.all_home()
    # Observe all three in their home zones.
    machine.observe({"buffer_a": {1}, "reagent_b": {2}, "stop": {3}}, now=clock.t)
    assert machine.all_home()
    # Lift one -> no longer all home.
    clock.advance(0.6)
    machine.observe({"buffer_a": set(), "reagent_b": {2}, "stop": {3}}, now=clock.t)
    assert not machine.all_home()


# --------------------------------------------------------------------------- #
# Frame sources.
# --------------------------------------------------------------------------- #
def test_array_frame_source_yields_then_none():
    f1 = solid_bgr((10, 20, 30))
    f2 = solid_bgr((40, 50, 60))
    src = ArrayFrameSource([f1, f2])
    assert src.read() is f1
    assert src.read() is f2
    assert src.read() is None


def test_camera_source_constructs_without_device():
    # Must not open a device at construction time, and read() returns None when
    # no camera is available rather than raising.
    src = CameraFrameSource(index=0)
    assert src.read() is None  # no camera in the sandbox
    src.release()


# --------------------------------------------------------------------------- #
# ArUco mat detection / rectification.
# --------------------------------------------------------------------------- #
def test_detect_markers_empty_frame_returns_none():
    assert detect_markers(np.zeros((0, 0, 3), dtype=np.uint8)) is None


def test_rectify_fewer_than_four_markers_returns_none():
    # A blank frame has no markers -> rectify must return None, not crash.
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    assert rectify(blank) is None
    # Explicitly passing only three corner markers also returns None.
    markers = {0: np.zeros((4, 2), np.float32), 1: np.zeros((4, 2), np.float32),
               2: np.zeros((4, 2), np.float32)}
    assert rectify(blank, markers) is None


def _make_marker_canvas() -> np.ndarray:
    """Draw the four corner ArUco markers on a white canvas (top-down view)."""
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    size = 800
    margin = 20
    marker_px = 120
    canvas = np.full((size, size, 3), 255, dtype=np.uint8)

    def place(marker_id: int, top: int, left: int) -> None:
        img = cv2.aruco.generateImageMarker(dictionary, marker_id, marker_px)
        img_bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        canvas[top:top + marker_px, left:left + marker_px] = img_bgr

    # ids 0=TL, 1=TR, 2=BR, 3=BL
    place(0, margin, margin)
    place(1, margin, size - margin - marker_px)
    place(2, size - margin - marker_px, size - margin - marker_px)
    place(3, size - margin - marker_px, margin)
    return canvas


def test_detect_markers_finds_four_corners():
    canvas = _make_marker_canvas()
    markers = detect_markers(canvas)
    assert markers is not None
    for cid in DEFAULT_CORNER_IDS:
        assert cid in markers, f"marker {cid} not detected"


def test_rectify_positive_path_produces_canvas():
    canvas = _make_marker_canvas()
    warped = rectify(canvas)
    assert warped is not None
    h, w = warped.shape[:2]
    assert (w, h) == DEFAULT_CANVAS_SIZE


# --------------------------------------------------------------------------- #
# Calibration persistence.
# --------------------------------------------------------------------------- #
def test_calibration_save_and_load_roundtrip(tmp_path):
    ranges = {
        "buffer_a": HSVRange((100, 80, 40), (130, 255, 255)),
        "stop": HSVRange((170, 80, 60), (10, 255, 255)),
    }
    path = tmp_path / "calib.json"
    save_calibration(ranges, path)
    loaded = load_calibration(path)
    assert loaded == ranges


def test_calibrate_returns_none_when_mat_missing(protocol):
    # A blank frame with no markers cannot be rectified -> calibrate returns None.
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    assert calibrate(blank, protocol) is None


def test_calibrate_samples_each_home_zone(protocol):
    # Build a synthetic rectified canvas with each home zone painted its cap
    # color, then calibrate directly on it (rectified=True).
    layout = ZoneLayout()
    w, h = DEFAULT_CANVAS_SIZE
    canvas = np.full((h, w, 3), 30, dtype=np.uint8)
    colors = {1: (255, 0, 0), 2: (0, 255, 255), 3: (0, 0, 255)}  # blue/yellow/red BGR
    for zone_id, bgr in colors.items():
        x0, y0, x1, y1 = layout.zone(zone_id).pixel_rect((w, h))
        canvas[y0:y1, x0:x1] = bgr

    ranges = calibrate(canvas, protocol, layout=layout, rectified=True)
    assert ranges is not None
    assert set(ranges) == {"buffer_a", "reagent_b", "stop"}
    # The calibrated blue range should mark a blue ROI as present.
    blue = solid_bgr((255, 0, 0))
    assert color_present(blue, ranges["buffer_a"])


# --------------------------------------------------------------------------- #
# VisionService end-to-end on synthetic frames.
# --------------------------------------------------------------------------- #
def test_vision_service_no_frame_status(protocol):
    src = ArrayFrameSource([])
    svc = VisionService(protocol, src)
    events = svc.step_once()
    assert events == []
    assert svc.status.state == "no_frame"


def test_vision_service_mat_not_detected_status(protocol):
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    src = ArrayFrameSource([blank])
    svc = VisionService(protocol, src)
    events = svc.step_once()
    assert events == []
    assert svc.status.state == "mat_not_detected"
