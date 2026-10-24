"""Smoke tests for the FastAPI backend wiring (FEAT-004).

These exercise the server deterministically with NO camera: a fake
:class:`FrameSource` returns ``None`` (so the UI would show "camera not
detected"), and the session is driven by *injected* vision events over the
WebSocket. This verifies that vision -> engine -> client relaying, step-state
updates, deviation alerts and the start precondition all work without any
hardware.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app import server
from app.events import Event


class _NoCameraSource:
    """A FrameSource that never yields a frame (sandbox has no camera)."""

    def read(self):
        return None

    def release(self):  # pragma: no cover - trivial
        return None


def _make_client() -> TestClient:
    server.set_frame_source_factory(_NoCameraSource)
    return TestClient(server.app)


def _drain_until(ws, predicate, limit: int = 200):
    """Receive messages until ``predicate(msg)`` is true; return that message."""
    for _ in range(limit):
        msg = json.loads(ws.receive_text())
        if predicate(msg):
            return msg
    raise AssertionError("expected message not received")


# --------------------------------------------------------------------------- #
# REST.
# --------------------------------------------------------------------------- #
def test_list_protocols_includes_demo():
    client = _make_client()
    resp = client.get("/protocols")
    assert resp.status_code == 200
    assert "demo_assay" in resp.json()["protocols"]


def test_get_protocol_returns_parsed_structure():
    client = _make_client()
    resp = client.get("/protocols/demo_assay")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Demo colorimetric assay"
    assert data["target_zone"] == 4
    assert len(data["steps"]) == 5
    assert len(data["reagents"]) == 3
    incubate = next(s for s in data["steps"] if s["type"] == "incubate")
    assert incubate["duration_s"] == 60
    assert incubate["warn_at_s"] == 50


def test_get_unknown_protocol_404():
    client = _make_client()
    assert client.get("/protocols/does_not_exist").status_code == 404


def test_protocol_name_traversal_rejected():
    client = _make_client()
    assert client.get("/protocols/..%2f..%2fetc%2fpasswd").status_code == 404


# --------------------------------------------------------------------------- #
# WebSocket session, driven by injected fake vision events.
# --------------------------------------------------------------------------- #
def test_session_start_reports_camera_not_detected():
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        started = _drain_until(ws, lambda m: m["type"] == "session_started")
        assert started["protocol"]["name"] == "Demo colorimetric assay"
        status = _drain_until(ws, lambda m: m["type"] == "status")
        # No camera -> cannot start the first step; status flags it.
        assert status["can_start"] is False
        assert status["mat_detected"] is False


def _vision_event(kind: str, bottle: str, ts: float) -> dict:
    return Event(
        source="vision",
        type=kind,
        payload={"bottle": bottle},
        timestamp=ts,
    ).to_dict()


def test_premature_vision_event_does_not_complete_a_step():
    """Before the start precondition is met, vision events must NOT advance.

    With no camera the mat is never 'tracking', so the precondition cannot be
    satisfied. A bottle_over_target arriving before the gate opens is recorded
    on the timeline but must NOT complete step 1 (the functional requirement:
    confirm every reagent home before allowing the first step).
    """
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")

        # Try to complete step 1 before readiness -> must be ignored by engine.
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "vision_event",
                    "event": _vision_event("bottle_over_target", "buffer_a", 2.0),
                }
            )
        )
        # The raw vision event is still mirrored to the timeline...
        over = _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["source"] == "vision"
            and m["event"]["type"] == "bottle_over_target",
        )
        assert over["event"]["payload"]["bottle"] == "buffer_a"

        # ...but the gated status that immediately follows the blocked event
        # reports the engine did NOT start and no step was completed. The server
        # enqueues status + step_state right after a blocked vision event.
        status = _drain_until(ws, lambda m: m["type"] == "status")
        assert status["can_start"] is False
        assert status.get("started") is False
        state = _drain_until(ws, lambda m: m["type"] == "step_state")
        # Step 1 was not completed; the current step is still step 1.
        assert state["completed"] == []
        assert state["current_step_id"] == 1
        assert state["finished"] is False


def test_happy_path_first_step_completes_and_advances():
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")
        # Open the start gate (bench confirmed ready). With no camera the
        # precondition can't be met organically, so mark ready explicitly.
        ws.send_text(json.dumps({"type": "ready"}))
        _drain_until(ws, lambda m: m["type"] == "status" and m["can_start"] is True)

        # Inject the expected add for step 1: lift Buffer A, then over target.
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "vision_event",
                    "event": _vision_event("bottle_over_target", "buffer_a", 2.0),
                }
            )
        )
        # The engine should emit step_completed; a step_state reflects it.
        completed = _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["type"] == "step_completed"
            and m["event"]["payload"]["step_id"] == 1,
        )
        assert completed["event"]["source"] == "engine"
        # After step 1 completes the engine advances off step 1; the final
        # step_state snapshot reflects both the completion and the advance.
        state = _drain_until(
            ws,
            lambda m: m["type"] == "step_state"
            and 1 in m["completed"]
            and m["current_step_id"] != 1,
        )
        assert state["current_step_id"] in (2, 3)


def test_deviation_alert_is_spoken_text():
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")
        ws.send_text(json.dumps({"type": "ready"}))
        _drain_until(ws, lambda m: m["type"] == "status" and m["can_start"] is True)

        # Complete step 1 (Buffer A) so the due step becomes Reagent B.
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "vision_event",
                    "event": _vision_event("bottle_over_target", "buffer_a", 2.0),
                }
            )
        )
        _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["type"] == "step_completed",
        )

        # Advance past the mix step via a spoken "mixed" (audio step_done), so
        # the due step becomes step 3 (Add Reagent B).
        ws.send_text(
            json.dumps(
                {
                    "type": "audio_event",
                    "event": Event(
                        source="audio", type="step_done", payload={}, timestamp=2.5
                    ).to_dict(),
                }
            )
        )
        _drain_until(
            ws,
            lambda m: m["type"] == "step_state" and m["current_step_id"] == 3,
        )

        # Now lift the red Stop Solution while Reagent B is due -> deviation.
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "stop", 3.0)}
            )
        )
        alert = _drain_until(ws, lambda m: m["type"] == "alert")
        assert alert["severity"] == "deviation"
        assert "stop" in alert["text"].lower()
        # The spoken text should mention the step actually due (Reagent B).
        assert "reagent b" in alert["text"].lower()


def test_spoken_observation_attaches_to_current_step(monkeypatch):
    """A transcript classified as an observation lands on the current step.

    No API key is set, so the language layer's deterministic fallback runs; the
    demo line 'the yellow looks a little paler than last time' must appear as an
    observation Event on the current step (step 3 in the demo).
    """
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")
        ws.send_text(json.dumps({"type": "ready"}))
        _drain_until(ws, lambda m: m["type"] == "status" and m["can_start"] is True)

        # Advance to step 3: complete step 1 (Buffer A), say "mixed" (step 2).
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "vision_event",
                    "event": _vision_event("bottle_over_target", "buffer_a", 2.0),
                }
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "audio_event",
                    "event": Event(
                        source="audio", type="step_done", payload={}, timestamp=2.5
                    ).to_dict(),
                }
            )
        )
        _drain_until(
            ws, lambda m: m["type"] == "step_state" and m["current_step_id"] == 3
        )

        # The presenter speaks a casual remark (a transcript event, NO wake word).
        ws.send_text(
            json.dumps(
                {
                    "type": "audio_event",
                    "event": Event(
                        source="audio",
                        type="transcript",
                        payload={
                            "text": "the yellow looks a little paler than last time",
                            "start": 0.0,
                            "end": 3.0,
                        },
                        timestamp=3.5,
                    ).to_dict(),
                }
            )
        )
        observation = _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["type"] == "observation",
        )
        assert observation["event"]["source"] == "audio"
        assert observation["event"]["step_id"] == 3
        assert "paler" in observation["event"]["payload"]["text"]


def test_spoken_correction_updates_checklist(monkeypatch):
    """A spoken correction is resolved and applied via the engine primitive."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")
        ws.send_text(json.dumps({"type": "ready"}))
        _drain_until(ws, lambda m: m["type"] == "status" and m["can_start"] is True)

        # Complete step 1 by pouring Buffer A.
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "vision_event",
                    "event": _vision_event("bottle_over_target", "buffer_a", 2.0),
                }
            )
        )
        _drain_until(
            ws,
            lambda m: m["type"] == "event" and m["event"]["type"] == "step_completed",
        )

        # Scientist corrects step 1 by voice: "no, that was the stop solution".
        # The server classifies the raw text, resolves the reagent key, and
        # applies the deterministic engine primitive.
        ws.send_text(
            json.dumps(
                {
                    "type": "correction",
                    "step_id": 1,
                    "text": "no, that was the stop solution",
                }
            )
        )
        applied = _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["type"] == "correction_applied",
        )
        assert applied["event"]["payload"]["reagent"] == "stop"


def test_spoken_correction_text_is_recorded_on_timeline(monkeypatch):
    """A spoken correction's raw text is logged AND the checklist updates once.

    A transcript classified as a correction must leave a ``correction_text``
    event on the timeline (so the report shows what the scientist said) and
    apply the deterministic primitive exactly once (no double-drive of the
    engine).
    """
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    # Force a correction classification that targets the already-completed
    # step 1 (the deterministic fallback would target the current step, which
    # is not yet completed; we pin step_id=1 so apply_correction takes effect).
    from app import llm

    def fake_classify(text, **kwargs):
        return {
            "kind": "correction",
            "text": text,
            "target_step_id": 1,
            "correction": {"step_id": 1, "reagent_key": "stop"},
        }

    monkeypatch.setattr(llm, "classify_segment", fake_classify)

    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")
        ws.send_text(json.dumps({"type": "ready"}))
        _drain_until(ws, lambda m: m["type"] == "status" and m["can_start"] is True)

        # Complete step 1 by pouring Buffer A.
        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(
            json.dumps(
                {
                    "type": "vision_event",
                    "event": _vision_event("bottle_over_target", "buffer_a", 2.0),
                }
            )
        )
        _drain_until(
            ws,
            lambda m: m["type"] == "event" and m["event"]["type"] == "step_completed",
        )

        # Scientist speaks a correction (a transcript, routed via the language
        # layer). The raw text must be recorded on the timeline.
        ws.send_text(
            json.dumps(
                {
                    "type": "audio_event",
                    "event": Event(
                        source="audio",
                        type="transcript",
                        payload={"text": "no, that was the stop solution", "start": 0.0, "end": 2.0},
                        timestamp=3.5,
                    ).to_dict(),
                }
            )
        )
        text_ev = _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["type"] == "correction_text",
        )
        assert text_ev["event"]["source"] == "audio"
        assert "stop solution" in text_ev["event"]["payload"]["text"].lower()
        assert text_ev["event"]["step_id"] == 1

        # The deterministic primitive was applied exactly once (one
        # correction_applied event follows, reassigning step 1 to stop).
        applied = _drain_until(
            ws,
            lambda m: m["type"] == "event"
            and m["event"]["type"] == "correction_applied",
        )
        assert applied["event"]["step_id"] == 1
        assert applied["event"]["payload"]["reagent"] == "stop"


def test_stop_session_saves_log_and_returns_report():
    client = _make_client()
    with client.websocket_connect("/ws/session") as ws:
        ws.send_text(json.dumps({"type": "start_session", "protocol": "demo_assay"}))
        _drain_until(ws, lambda m: m["type"] == "session_started")

        ws.send_text(
            json.dumps(
                {"type": "vision_event", "event": _vision_event("bottle_lifted", "buffer_a", 1.0)}
            )
        )
        ws.send_text(json.dumps({"type": "stop_session"}))
        report = _drain_until(ws, lambda m: m["type"] == "report")
        assert "markdown" in report
        assert report["log_path"].endswith(".json")
        # The saved log file exists and round-trips.
        from pathlib import Path

        assert Path(report["log_path"]).is_file()
        assert report["log"]["protocol_name"] == "Demo colorimetric assay"
