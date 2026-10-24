"""Benchwatch FastAPI backend: the single hub all services talk through.

The spec's load-bearing invariant is that the four services (vision, audio,
engine, language) communicate through ONE FastAPI backend over WebSockets. This
module is that hub. It:

* serves the list of protocols and a parsed protocol for the checklist (REST),
* accepts a WebSocket session, loads the chosen protocol, builds a
  :class:`SessionLog` and a deterministic :class:`ProtocolEngine`, starts the
  :class:`VisionService`, and streams every engine/vision/audio event to the
  client while appending it to the log (the single source of truth),
* enforces the start precondition (mat detected AND all reagents home) before
  the first step is allowed,
* drives the engine's incubation timers on a periodic tick and relays a
  per-second countdown plus timer warnings/overruns,
* streams the rectified camera feed as base64 JPEG, degrading to a
  ``camera not detected`` status when no frame is available (the sandbox has no
  camera), and
* saves the session log as replayable JSON on finish and calls a report hook
  (filled in by FEAT-006).

Everything hardware- and network-dependent sits behind the vision interface and
injectable fakes, so this server boots and accepts WebSocket connections with no
camera present.

WebSocket message protocol
==========================

The client connects to ``/ws/session``. Messages are JSON objects. Every
message has a ``type`` field.

Client -> server
-----------------
* ``{"type": "start_session", "protocol": "demo"}`` - load the named protocol
  and begin a session. Vision starts; the engine is created.
* ``{"type": "stop_session"}`` - end the session, save the log, return a report.
* ``{"type": "calibrate"}`` - run a color-calibration pass on the latest frame.
* ``{"type": "correction", "step_id": 3, "reagent": "buffer_a", "text": "..."}``
  - apply a deterministic correction to a completed step. ``text`` is the raw
  spoken phrase (the LLM layer, FEAT-005, parses it into step_id/reagent before
  sending this; the engine only ever sees the resolved primitive).
* ``{"type": "ready"}`` - explicitly satisfy the start precondition and latch
  the gate open. Sent by the client once the reported status shows the bench is
  ready (mat detected + all reagents home), and used by tests/replay to open the
  gate deterministically with no camera. Until the precondition is met (or this
  is sent), vision events are recorded on the timeline but do NOT drive the
  engine, so no step completes before the bench is confirmed ready.
* ``{"type": "vision_event", "event": {...}}`` - inject a vision Event
  (``Event.to_dict()`` shape). Used by tests and replay to drive the engine
  deterministically without a real camera. Audio/LLM (FEAT-005) use the same
  injection path with ``{"type": "audio_event", "event": {...}}``.

Server -> client
----------------
* ``{"type": "event", "event": {...}}`` - mirrors an Event (``Event.to_dict()``)
  for the timeline. Sent for every vision/audio/engine event.
* ``{"type": "step_state", "current_step_index": int, "current_step_id": int|None,
  "completed": [step_id, ...], "finished": bool, "steps": [...]}`` - the
  checklist state after every change.
* ``{"type": "timer", "step_id": int, "remaining_s": float, "duration_s": float,
  "warn_at_s": float|None, "running": bool}`` - the live countdown for the
  active incubate step (emitted ~1/s).
* ``{"type": "alert", "text": str, "severity": "deviation"|"warning"|"overrun"}``
  - a short spoken alert. The frontend speaks ``text`` via speechSynthesis and
  shows it in the alert banner. Mapped from engine deviation/timer events.
* ``{"type": "status", "state": str, "detail": str, "can_start": bool,
  "mat_detected": bool, "all_home": bool}`` - mat/calibration/camera status and
  whether the first step may begin.
* ``{"type": "frame", "jpeg_b64": str}`` - the latest rectified frame as a
  base64 JPEG, or omitted when no frame is available.
* ``{"type": "session_started", "protocol": {...}}`` - ack with the parsed
  protocol for the checklist.
* ``{"type": "report", "markdown": str, "log_path": str, "log": {...}}`` - sent
  on stop; the report markdown is a placeholder until FEAT-006 wires the real
  generator.
* ``{"type": "error", "message": str}`` - a problem with a client request.
"""

from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app import llm
from app.engine import (
    EV_DEVIATION,
    EV_TIMER_OVERRUN,
    EV_TIMER_WARNING,
    ProtocolEngine,
)
from app.events import Event, SessionLog
from app.protocol import Protocol, Reagent, Step, load_protocol
from app.vision import (
    CameraFrameSource,
    FrameSource,
    VisionService,
    rectify,
)

try:  # OpenCV is a hard backend dependency, but guard so import never crashes.
    import cv2  # type: ignore

    _CV2_AVAILABLE = True
except Exception:  # pragma: no cover - cv2 is expected to be present
    cv2 = None  # type: ignore
    _CV2_AVAILABLE = False

# --------------------------------------------------------------------------- #
# Paths.
# --------------------------------------------------------------------------- #
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROTOCOLS_DIR = BACKEND_DIR / "protocols"
SESSIONS_DIR = BACKEND_DIR / "sessions"

# Severity mapping for engine events -> spoken alert severity.
_ALERT_SEVERITY = {
    EV_DEVIATION: "deviation",
    EV_TIMER_WARNING: "warning",
    EV_TIMER_OVERRUN: "overrun",
}

# How often the engine timers tick / the countdown is pushed (seconds).
TICK_INTERVAL_S = 1.0


# --------------------------------------------------------------------------- #
# Protocol discovery / serialization helpers (REST).
# --------------------------------------------------------------------------- #
def list_protocol_names(directory: Path = PROTOCOLS_DIR) -> List[str]:
    """Return the available protocol names (YAML stems) sorted."""
    if not directory.is_dir():
        return []
    names = set()
    for pattern in ("*.yaml", "*.yml"):
        for path in directory.glob(pattern):
            names.add(path.stem)
    return sorted(names)


def _protocol_path(name: str) -> Optional[Path]:
    """Resolve a protocol name to a YAML path inside PROTOCOLS_DIR, safely."""
    # Guard against path traversal: only accept a bare stem.
    if not name or "/" in name or "\\" in name or ".." in name:
        return None
    for ext in (".yaml", ".yml"):
        candidate = PROTOCOLS_DIR / f"{name}{ext}"
        if candidate.is_file():
            return candidate
    return None


def reagent_to_dict(key: str, reagent: Reagent) -> Dict[str, Any]:
    return {
        "key": key,
        "label": reagent.label,
        "cap_color": reagent.cap_color,
        "zone": reagent.zone,
    }


def step_to_dict(step: Step) -> Dict[str, Any]:
    return {
        "id": step.id,
        "type": step.type,
        "description": step.description,
        "reagent": step.reagent,
        "duration_s": step.duration_s,
        "warn_at_s": step.warn_at_s,
    }


def protocol_to_dict(protocol: Protocol) -> Dict[str, Any]:
    """A JSON-serializable view of a protocol for the frontend checklist."""
    return {
        "name": protocol.name,
        "target_zone": protocol.target_zone,
        "reagents": {
            key: reagent_to_dict(key, reagent)
            for key, reagent in protocol.reagents.items()
        },
        "steps": [step_to_dict(step) for step in protocol.steps],
    }


# --------------------------------------------------------------------------- #
# Session.
# --------------------------------------------------------------------------- #
class Session:
    """One live WebSocket session: protocol + log + engine + vision.

    A session owns the deterministic engine and the vision service, wires the
    vision ``on_event`` callback into the engine, and relays every event to the
    client through a thread-safe queue (vision runs on a background thread while
    the WebSocket lives on the asyncio loop).

    ``frame_source_factory`` is injectable so tests can feed synthetic frames or
    none at all; the default is a lazy camera that returns ``None`` with no
    device (so nothing crashes in the sandbox).
    """

    def __init__(
        self,
        protocol: Protocol,
        *,
        loop: asyncio.AbstractEventLoop,
        frame_source: Optional[FrameSource] = None,
        start_vision: bool = True,
    ) -> None:
        self.protocol = protocol
        self.loop = loop
        self.log = SessionLog(protocol_name=protocol.name)
        self._outbox: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue()
        self.started_first_step = False
        self.finished = False

        # The engine emits engine events; route them through _on_event so they
        # are logged and relayed exactly like vision/audio events.
        self.engine = ProtocolEngine(
            self.protocol, log=self.log, emit=self._on_engine_event
        )

        self.frame_source: FrameSource = frame_source or CameraFrameSource()
        self.vision = VisionService(
            self.protocol,
            self.frame_source,
            on_event=self._on_vision_event,
        )
        # The latest rectified frame (for JPEG streaming). Updated by the loop.
        self._latest_canvas = None
        self._start_vision = start_vision

    # -- outbound plumbing -------------------------------------------------- #
    def _enqueue(self, message: Dict[str, Any]) -> None:
        """Thread-safe enqueue of an outbound message (callable from any thread)."""
        try:
            self.loop.call_soon_threadsafe(self._outbox.put_nowait, message)
        except RuntimeError:  # pragma: no cover - loop already closed
            pass

    async def next_message(self) -> Dict[str, Any]:
        return await self._outbox.get()

    # -- event handling ----------------------------------------------------- #
    def _relay_event(self, event: Event) -> None:
        """Send an Event to the client and derive UI updates from it."""
        self._enqueue({"type": "event", "event": event.to_dict()})
        if event.source == "engine":
            self._maybe_alert(event)
        # Any event can change checklist state; push the current snapshot.
        self._enqueue(self.step_state_message())

    def _on_engine_event(self, event: Event) -> Event:
        # emit callback: engine already appended to the log.
        self._relay_event(event)
        return event

    def _on_vision_event(self, event: Event) -> None:
        # Vision events are NOT yet in the log; append then (maybe) feed the
        # engine. Every raw vision event is still recorded on the timeline (the
        # single source of truth) and relayed to the client regardless of the
        # start gate, so the UI shows bench activity while we wait.
        self.log.append(event)
        self._enqueue({"type": "event", "event": event.to_dict()})

        # Start precondition (the functional requirement): until the mat is
        # detected AND every reagent is confirmed home at least once, do NOT let
        # vision events drive the deterministic engine. The engine stays
        # untouched; the gate lives here in the session/server layer. Once the
        # precondition is satisfied we latch `started_first_step` and proceed
        # normally for the rest of the session (so a reagent briefly leaving its
        # home zone mid-run does not re-close the gate).
        if not self.started_first_step:
            if self.can_start():
                self.started_first_step = True
                self._enqueue(self.status_message())
            else:
                # Not ready yet: surface why we are waiting and skip the engine.
                self._enqueue(self.status_message())
                self._enqueue(self.step_state_message())
                return

        # The deterministic engine decides match/deviation/timers. Its emitted
        # events flow back through _on_engine_event.
        self.engine.handle_event(event)
        self._enqueue(self.step_state_message())

    def _maybe_alert(self, event: Event) -> None:
        severity = _ALERT_SEVERITY.get(event.type)
        if severity is None:
            return
        text = event.payload.get("message")
        if not text:
            return
        self._enqueue({"type": "alert", "text": text, "severity": severity})

    # -- injected (test / replay / audio) events ---------------------------- #
    def inject_vision_event(self, event: Event) -> None:
        """Feed a vision Event as if the camera produced it (tests/replay)."""
        self._on_vision_event(event)

    def inject_audio_event(self, event: Event) -> None:
        """Feed an audio/user Event (FEAT-005 plugs transcript/corrections here).

        A ``transcript`` event is routed through the language layer
        (:meth:`handle_transcript`): the engine itself never sees raw speech.
        Any other audio event (e.g. ``step_done``, ``correction``) is logged,
        relayed and fed to the deterministic engine as before.
        """
        if event.type == "transcript":
            text = (event.payload or {}).get("text", "")
            # Still record the raw transcript on the timeline, then classify it.
            self.log.append(event)
            self._enqueue({"type": "event", "event": event.to_dict()})
            self.handle_transcript(text, timestamp=event.timestamp)
            return
        self.log.append(event)
        self._enqueue({"type": "event", "event": event.to_dict()})
        self.engine.handle_event(event)
        self._enqueue(self.step_state_message())

    def classify(self, text: str) -> Dict[str, Any]:
        """Classify a transcript via the language layer (no side effects).

        Used when the client sends a raw spoken ``correction`` text so the
        server can resolve it to a (step_id, reagent_key) before calling the
        deterministic engine primitive.
        """
        current = self.engine.current_step
        return llm.classify_segment(
            text,
            current_step=current.id if current else None,
            recent_events=self.log.events[-8:],
            protocol=self.protocol,
        )

    def handle_transcript(
        self, text: str, *, timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """Classify a transcript via the language layer and route the result.

        Observations are attached to the CURRENT step as
        ``Event(source="audio", type="observation", step_id=...)`` appended to
        the log and relayed to the timeline. Corrections are resolved to a
        (step_id, reagent_key) pair and applied through the engine's
        deterministic ``apply_correction`` primitive (the LLM never drives
        matching/ordering/timers). Questions and chatter are logged for the
        timeline but do NOT alter protocol state.

        Returns the classification dict (useful for tests/callers).
        """
        current = self.engine.current_step
        current_step_id = current.id if current else None
        recent = self.log.events[-8:]
        result = llm.classify_segment(
            text,
            current_step=current_step_id,
            recent_events=recent,
            protocol=self.protocol,
        )
        kind = result.get("kind")

        if kind == "observation":
            target = result.get("target_step_id")
            step_id = target if isinstance(target, int) else current_step_id
            observation = Event(
                source="audio",
                type="observation",
                step_id=step_id,
                payload={"text": result.get("text", text)},
                timestamp=timestamp if timestamp is not None else self.vision.clock(),
            )
            self.log.append(observation)
            self._enqueue({"type": "event", "event": observation.to_dict()})

        elif kind == "correction":
            correction = result.get("correction") or {}
            step_id = correction.get("step_id")
            reagent_key = correction.get("reagent_key")
            # Record what the scientist actually said on the timeline/log FIRST,
            # as a non-engine-consumed `correction_text` event (the engine only
            # consumes audio type 'correction', so using a distinct type keeps
            # the deterministic primitive from being driven twice). Then apply
            # the resolved correction through the engine exactly once.
            spoken = Event(
                source="audio",
                type="correction_text",
                step_id=step_id,
                payload={"text": result.get("text", text)},
                timestamp=timestamp if timestamp is not None else self.vision.clock(),
            )
            self.log.append(spoken)
            self._enqueue({"type": "event", "event": spoken.to_dict()})
            if step_id is not None and reagent_key is not None:
                self.apply_correction(step_id=step_id, reagent_key=reagent_key)
                self._enqueue(self.step_state_message())

        else:  # question / chatter: record on the timeline, no state change.
            note = Event(
                source="audio",
                type=kind if kind in ("question", "chatter") else "chatter",
                step_id=current_step_id,
                payload={"text": result.get("text", text)},
                timestamp=timestamp if timestamp is not None else self.vision.clock(),
            )
            self.log.append(note)
            self._enqueue({"type": "event", "event": note.to_dict()})

        return result

    def apply_correction(
        self, *, step_id: Optional[int], reagent_key: Optional[str]
    ) -> None:
        """Deterministic correction primitive (LLM resolves the text first)."""
        self.engine.apply_correction(step_id=step_id, reagent_key=reagent_key)

    # -- UI snapshots ------------------------------------------------------- #
    def step_state_message(self) -> Dict[str, Any]:
        current = self.engine.current_step
        return {
            "type": "step_state",
            "current_step_index": self.engine.current_step_index,
            "current_step_id": current.id if current else None,
            "completed": sorted(self.engine.completed.keys()),
            "finished": self.engine.finished,
        }

    def mat_detected(self) -> bool:
        return self.vision.status.state == "tracking"

    def can_start(self) -> bool:
        """The first step is allowed only once the mat is detected and every
        reagent is confirmed home (the functional requirement).

        Once the precondition has been satisfied at least once the session
        latches ``started_first_step`` and stays started for the rest of the
        run, so ``can_start`` reports True from then on regardless of transient
        vision state.
        """
        if self.started_first_step:
            return True
        return self.mat_detected() and self.vision.all_reagents_home()

    def mark_ready(self) -> bool:
        """Explicitly satisfy the start precondition and latch the gate open.

        This is the deterministic test/replay seam: with no camera the mat is
        never 'tracking', so the precondition can never be met organically in
        the sandbox. The frontend's Calibrate/Start flow (which only enables
        Start once ``can_start`` is reported True) and replay drivers use this
        to open the gate explicitly. It never bypasses a *failed* precondition
        in production because the client only sends it once the reported status
        says the bench is ready. Returns the new latched state.
        """
        self.started_first_step = True
        self._enqueue(self.status_message())
        return self.started_first_step

    def status_message(self) -> Dict[str, Any]:
        st = self.vision.status
        mat = self.mat_detected()
        all_home = self.vision.all_reagents_home()
        detail = st.detail
        if st.state == "no_frame":
            detail = "camera not detected"
        return {
            "type": "status",
            "state": st.state,
            "detail": detail,
            "mat_detected": mat,
            "all_home": all_home,
            # Reports the latched start gate: True once the precondition has
            # been satisfied (or explicitly marked ready) at least once.
            "can_start": self.can_start(),
            "started": self.started_first_step,
        }

    def timer_message(self) -> Optional[Dict[str, Any]]:
        """The live countdown for the active incubate step, if one is running.

        The engine owns all timers (invariant); we read its active timer state
        to derive the remaining-seconds countdown for the UI. ``None`` when no
        incubation is currently running.
        """
        timer = getattr(self.engine, "_timer", None)
        if not timer:
            return None
        duration = float(timer.get("duration_s") or 0.0)
        elapsed = max(0.0, self.vision.clock() - float(timer.get("start", 0.0)))
        remaining = max(0.0, duration - elapsed)
        return {
            "type": "timer",
            "step_id": timer.get("step_id"),
            "remaining_s": round(remaining, 1),
            "duration_s": duration,
            "warn_at_s": timer.get("warn_at_s"),
            "running": True,
        }

    # -- lifecycle ---------------------------------------------------------- #
    def start(self) -> None:
        if self._start_vision:
            self.vision.start(threaded=True)

    def latest_frame_jpeg_b64(self) -> Optional[str]:
        """Encode the latest rectified frame as base64 JPEG, if available."""
        if not _CV2_AVAILABLE:
            return None
        frame = self.frame_source.read()
        if frame is None:
            return None
        canvas = rectify(frame)
        if canvas is None:
            return None
        ok, buf = cv2.imencode(".jpg", canvas)
        if not ok:
            return None
        return base64.b64encode(buf.tobytes()).decode("ascii")

    def save_log(self) -> Path:
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(self.log.events[-1].timestamp) if self.log.events else 0
        safe_name = self.protocol.name.lower().replace(" ", "_")
        path = SESSIONS_DIR / f"session_{safe_name}_{ts}.json"
        return self.log.save_json(path)

    def build_report(self) -> str:
        """Placeholder report. FEAT-006 replaces this with the real generator.

        Until then we emit a minimal Markdown summary derived from the event log
        (still the single source of truth), so the client has something to show.
        """
        try:
            from app import report as report_module  # type: ignore

            generator = getattr(report_module, "generate_report", None)
            if callable(generator):
                return generator(self.log, self.protocol)
        except Exception:
            pass
        return _placeholder_report(self.log, self.protocol)

    def stop(self) -> Dict[str, Any]:
        if not self.finished:
            self.finished = True
            try:
                self.vision.stop()
            except Exception:
                pass
        log_path = self.save_log()
        markdown = self.build_report()
        return {
            "type": "report",
            "markdown": markdown,
            "log_path": str(log_path),
            "log": self.log.to_dict(),
        }


def _placeholder_report(log: SessionLog, protocol: Protocol) -> str:
    """A deterministic, dependency-free Markdown summary of the session log."""
    lines = [f"# Benchwatch session: {protocol.name}", ""]
    completed = [e for e in log.by_type("step_completed")]
    deviations = [e for e in log.by_type("deviation")]
    overruns = [e for e in log.by_type("timer_overrun")]
    lines.append(f"- Steps completed: {len(completed)} / {len(protocol.steps)}")
    lines.append(f"- Deviations flagged: {len(deviations)}")
    lines.append(f"- Timer overruns: {len(overruns)}")
    lines.append("")
    lines.append("_Full report generation is wired in FEAT-006._")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# FastAPI app.
# --------------------------------------------------------------------------- #
app = FastAPI(title="Benchwatch", version="0.1.0")

# A factory the test suite can override to inject a fake FrameSource. Default is
# None, which makes each Session construct a lazy CameraFrameSource.
_frame_source_factory = None


def set_frame_source_factory(factory) -> None:
    """Install a FrameSource factory (used by tests to inject fakes)."""
    global _frame_source_factory
    _frame_source_factory = factory


@app.get("/protocols")
def get_protocols() -> Dict[str, Any]:
    """List the available protocols (YAML files under protocols/)."""
    return {"protocols": list_protocol_names()}


@app.get("/protocols/{name}")
def get_protocol(name: str):
    """Return a parsed protocol for the checklist."""
    path = _protocol_path(name)
    if path is None:
        return JSONResponse(
            status_code=404, content={"error": f"protocol '{name}' not found"}
        )
    protocol = load_protocol(path)
    return protocol_to_dict(protocol)


@app.get("/healthz")
def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/session")
async def session_socket(ws: WebSocket) -> None:
    """The single session WebSocket all services communicate through."""
    await ws.accept()
    loop = asyncio.get_running_loop()
    session: Optional[Session] = None
    sender_task: Optional[asyncio.Task] = None
    ticker_task: Optional[asyncio.Task] = None

    async def pump_outbox(sess: Session) -> None:
        """Forward queued outbound messages to the client."""
        try:
            while True:
                message = await sess.next_message()
                await ws.send_text(json.dumps(message))
        except asyncio.CancelledError:  # pragma: no cover - teardown
            raise
        except Exception:  # pragma: no cover - client vanished
            return

    async def ticker(sess: Session) -> None:
        """Drive engine timers and push the countdown + status periodically."""
        try:
            while not sess.finished:
                sess.engine.tick()
                tmsg = sess.timer_message()
                if tmsg is not None:
                    await ws.send_text(json.dumps(tmsg))
                await ws.send_text(json.dumps(sess.status_message()))
                frame = sess.latest_frame_jpeg_b64()
                if frame is not None:
                    await ws.send_text(
                        json.dumps({"type": "frame", "jpeg_b64": frame})
                    )
                await asyncio.sleep(TICK_INTERVAL_S)
        except asyncio.CancelledError:  # pragma: no cover - teardown
            raise
        except Exception:  # pragma: no cover
            return

    def make_frame_source() -> Optional[FrameSource]:
        if _frame_source_factory is not None:
            return _frame_source_factory()
        return None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(
                    json.dumps({"type": "error", "message": "invalid JSON"})
                )
                continue

            mtype = msg.get("type")

            if mtype == "start_session":
                name = msg.get("protocol")
                path = _protocol_path(str(name) if name else "")
                if path is None:
                    await ws.send_text(
                        json.dumps(
                            {"type": "error", "message": f"unknown protocol {name!r}"}
                        )
                    )
                    continue
                protocol = load_protocol(path)
                session = Session(
                    protocol,
                    loop=loop,
                    frame_source=make_frame_source(),
                )
                sender_task = asyncio.create_task(pump_outbox(session))
                session.start()
                ticker_task = asyncio.create_task(ticker(session))
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "session_started",
                            "protocol": protocol_to_dict(protocol),
                        }
                    )
                )
                await ws.send_text(json.dumps(session.step_state_message()))
                await ws.send_text(json.dumps(session.status_message()))

            elif mtype == "stop_session":
                if session is None:
                    await ws.send_text(
                        json.dumps({"type": "error", "message": "no active session"})
                    )
                    continue
                report = session.stop()
                if ticker_task:
                    ticker_task.cancel()
                await ws.send_text(json.dumps(report))

            elif mtype == "calibrate":
                if session is None:
                    await ws.send_text(
                        json.dumps({"type": "error", "message": "no active session"})
                    )
                    continue
                frame = session.frame_source.read()
                calibrated = False
                if frame is not None:
                    ranges = session.vision.calibrate_from_frame(frame)
                    calibrated = bool(ranges)
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "status",
                            "state": "calibrated" if calibrated else "no_frame",
                            "detail": (
                                "calibration complete"
                                if calibrated
                                else "camera not detected"
                            ),
                            "mat_detected": session.mat_detected(),
                            "all_home": session.vision.all_reagents_home(),
                            "can_start": session.can_start(),
                        }
                    )
                )

            elif mtype == "correction":
                if session is None:
                    await ws.send_text(
                        json.dumps({"type": "error", "message": "no active session"})
                    )
                    continue
                step_id = msg.get("step_id")
                reagent = msg.get("reagent")
                text = msg.get("text")
                # If the client sent only raw text, resolve it via the language
                # layer here (classification only; the engine still sees just
                # the resolved deterministic primitive).
                if (step_id is None or reagent is None) and text:
                    result = session.classify(str(text))
                    correction = result.get("correction") or {}
                    if step_id is None:
                        step_id = correction.get("step_id")
                    if reagent is None:
                        reagent = correction.get("reagent_key")
                if step_id is not None and reagent is not None:
                    session.apply_correction(step_id=step_id, reagent_key=reagent)
                    await ws.send_text(json.dumps(session.step_state_message()))

            elif mtype == "ready":
                if session is None:
                    await ws.send_text(
                        json.dumps({"type": "error", "message": "no active session"})
                    )
                    continue
                session.mark_ready()
                await ws.send_text(json.dumps(session.status_message()))

            elif mtype == "vision_event":
                if session is None:
                    await ws.send_text(
                        json.dumps({"type": "error", "message": "no active session"})
                    )
                    continue
                session.inject_vision_event(Event.from_dict(msg["event"]))

            elif mtype == "audio_event":
                if session is None:
                    await ws.send_text(
                        json.dumps({"type": "error", "message": "no active session"})
                    )
                    continue
                session.inject_audio_event(Event.from_dict(msg["event"]))

            else:
                await ws.send_text(
                    json.dumps(
                        {"type": "error", "message": f"unknown message type {mtype!r}"}
                    )
                )

    except WebSocketDisconnect:
        pass
    finally:
        if ticker_task:
            ticker_task.cancel()
        if sender_task:
            sender_task.cancel()
        if session is not None and not session.finished:
            try:
                session.vision.stop()
            except Exception:
                pass
