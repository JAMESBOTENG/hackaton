"""Unit tests for the deterministic protocol engine.

The engine is driven entirely by fake events and a controllable clock, so the
suite runs with no camera, no microphone, no network and no real sleeps.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.engine import (
    EV_CORRECTION_APPLIED,
    EV_DEVIATION,
    EV_SESSION_COMPLETE,
    EV_STEP_COMPLETED,
    EV_STEP_SKIPPED,
    EV_TIMER_OVERRUN,
    EV_TIMER_WARNING,
    ProtocolEngine,
)
from app.events import Event, SessionLog
from app.protocol import load_protocol

DEMO_PATH = Path(__file__).resolve().parents[1] / "protocols" / "demo_assay.yaml"


class Clock:
    """A simple controllable clock for deterministic timer tests."""

    def __init__(self, start: float = 0.0) -> None:
        self.t = float(start)

    def __call__(self) -> float:
        return self.t

    def set(self, t: float) -> None:
        self.t = float(t)


@pytest.fixture()
def protocol():
    return load_protocol(DEMO_PATH)


def make_engine(protocol, clock=None):
    log = SessionLog(protocol_name=protocol.name)
    engine = ProtocolEngine(protocol, log, clock=clock or Clock())
    return engine, log


def lifted(bottle: str, t: float) -> Event:
    return Event(source="vision", type="bottle_lifted", payload={"bottle": bottle}, timestamp=t)


def over_target(bottle: str, t: float) -> Event:
    return Event(source="vision", type="bottle_over_target", payload={"bottle": bottle}, timestamp=t)


def returned(bottle: str, t: float) -> Event:
    return Event(source="vision", type="bottle_returned", payload={"bottle": bottle}, timestamp=t)


def spoken_mixed(t: float) -> Event:
    return Event(source="audio", type="step_done", payload={"text": "mixed"}, timestamp=t)


def types_of(log: SessionLog):
    return [e.type for e in log.events]


# --------------------------------------------------------------------------
# (a) Full demo happy path
# --------------------------------------------------------------------------
def test_full_demo_happy_path(protocol):
    clock = Clock()
    engine, log = make_engine(protocol, clock)

    # Step 1: Add Buffer A
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(returned("buffer_a", 3.0))

    # Step 2: mix — completed by a spoken "mixed".
    engine.handle_event(spoken_mixed(4.0))

    # Step 3: Add Reagent B
    engine.handle_event(lifted("reagent_b", 5.0))
    engine.handle_event(over_target("reagent_b", 6.0))
    engine.handle_event(returned("reagent_b", 7.0))

    # Step 4: incubate — completes when the next action (step 5 lift) happens
    # well within the 60s duration. Step 5: Add Stop Solution.
    engine.handle_event(lifted("stop", 50.0))
    engine.handle_event(over_target("stop", 51.0))

    completed = log.by_type(EV_STEP_COMPLETED)
    completed_ids = [e.step_id for e in completed]
    assert completed_ids == [1, 2, 3, 4, 5]

    # Zero deviations, zero overruns on the clean run.
    assert log.by_type(EV_DEVIATION) == []
    assert log.by_type(EV_TIMER_OVERRUN) == []

    # Session completes exactly once.
    assert len(log.by_type(EV_SESSION_COMPLETE)) == 1
    assert engine.finished is True
    assert engine.current_step_index == len(protocol.steps)


def test_happy_path_mix_auto_advances_on_next_lift(protocol):
    """Lifting the reagent_b bottle advances through the mix step itself."""
    engine, log = make_engine(protocol)

    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))

    # No spoken "mixed" — lift the next add bottle directly.
    engine.handle_event(lifted("reagent_b", 3.0))

    # Mix (step 2) should have auto-completed; no deviation emitted.
    assert [e.step_id for e in log.by_type(EV_STEP_COMPLETED)] == [1, 2]
    assert log.by_type(EV_DEVIATION) == []
    assert engine.current_step.id == 3


# --------------------------------------------------------------------------
# (b) Early deviation — red stop lifted while Reagent B is due
# --------------------------------------------------------------------------
def test_early_deviation_on_stop_during_reagent_b(protocol):
    engine, log = make_engine(protocol)

    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(spoken_mixed(3.0))

    # Step 3 (Reagent B) is now due; the presenter reaches for red Stop.
    produced = engine.handle_event(lifted("stop", 4.0))

    # Exactly one deviation, emitted ON the bottle_lifted event (no
    # bottle_over_target has occurred yet).
    deviations = [e for e in produced if e.type == EV_DEVIATION]
    assert len(deviations) == 1
    dev = deviations[0]

    assert dev.source == "engine"
    assert dev.step_id == 3
    assert dev.payload["lifted"] == "stop"
    assert dev.payload["lifted_label"] == "Stop Solution"
    assert dev.payload["due_step_id"] == 3
    assert dev.payload["expected"] == "reagent_b"
    assert dev.payload["expected_label"] == "Reagent B"
    # The spoken alert names the stop solution and step 3, Reagent B.
    assert "Stop Solution" in dev.payload["message"]
    assert "step 3" in dev.payload["message"]
    assert "Reagent B" in dev.payload["message"]

    # It fired before the pour: no step_completed for step 3 yet.
    assert 3 not in [e.step_id for e in log.by_type(EV_STEP_COMPLETED)]


def test_deviation_fires_within_one_second_timestamp(protocol):
    """The deviation event carries the lift timestamp (sub-second latency)."""
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 0.0))
    engine.handle_event(over_target("buffer_a", 0.1))
    engine.handle_event(spoken_mixed(0.2))

    lift_t = 10.0
    produced = engine.handle_event(lifted("stop", lift_t))
    dev = [e for e in produced if e.type == EV_DEVIATION][0]
    assert dev.timestamp == lift_t  # emitted on the lift, not later


# --------------------------------------------------------------------------
# (c) Ignored deviation then wrong pour recorded, tracking continues
# --------------------------------------------------------------------------
def test_ignored_deviation_then_wrong_pour_continues_tracking(protocol):
    engine, log = make_engine(protocol)

    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(spoken_mixed(3.0))

    # Deviation: stop lifted while reagent_b due.
    engine.handle_event(lifted("stop", 4.0))
    assert len(log.by_type(EV_DEVIATION)) == 1

    # The presenter ignores the warning and pours stop anyway. Stop is the
    # reagent of step 5, so tracking jumps forward, recording the out-of-order
    # pour, and the engine continues from the step actually performed.
    engine.handle_event(over_target("stop", 5.0))

    completed = log.by_type(EV_STEP_COMPLETED)
    # The stop pour completes step 5 (flagged as a deviation pour); step 3 and
    # step 4 were jumped over.
    step5 = [e for e in completed if e.step_id == 5]
    assert len(step5) == 1
    assert step5[0].payload.get("deviation") is True
    assert step5[0].payload.get("reagent") == "stop"

    # Only one deviation alert (the early warning); the pour is recorded.
    assert len(log.by_type(EV_DEVIATION)) == 1
    # Engine advanced past the performed step.
    assert engine.current_step_index >= 5


def test_wrong_order_pour_emits_step_skipped_for_jumped_steps(protocol):
    """Steps jumped over by an out-of-order pour emit step_skipped events.

    When Stop (step 5's reagent) is poured while Reagent B (step 3) is due, the
    engine jumps forward to step 5. Step 3 (add Reagent B) and step 4 (incubate)
    are jumped over and must leave a self-describing ``step_skipped`` trace in
    the log (step 2, mix, is auto-completed, not skipped).
    """
    engine, log = make_engine(protocol)

    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(spoken_mixed(3.0))

    # Deviation then wrong pour (stop) while reagent_b (step 3) is due.
    engine.handle_event(lifted("stop", 4.0))
    engine.handle_event(over_target("stop", 5.0))

    skipped = log.by_type(EV_STEP_SKIPPED)
    skipped_ids = sorted(e.step_id for e in skipped)
    # Step 3 (add Reagent B) and step 4 (incubate) were jumped over.
    assert skipped_ids == [3, 4]
    for e in skipped:
        assert e.source == "engine"
        assert e.payload.get("reason") == "wrong_order_pour"
        assert e.payload.get("description")

    # Step 5 completed as the deviation pour; happy-path record intact.
    step5 = [e for e in log.by_type(EV_STEP_COMPLETED) if e.step_id == 5]
    assert len(step5) == 1
    assert step5[0].payload.get("deviation") is True


def test_happy_path_emits_no_step_skipped(protocol):
    """A clean run never emits step_skipped (no regression of correct path)."""
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(spoken_mixed(3.0))
    engine.handle_event(lifted("reagent_b", 4.0))
    engine.handle_event(over_target("reagent_b", 5.0))
    engine.handle_event(lifted("stop", 50.0))
    engine.handle_event(over_target("stop", 51.0))
    assert log.by_type(EV_STEP_SKIPPED) == []


def test_wrong_pour_of_same_step_marks_deviation(protocol):
    """Pouring a wrong bottle whose reagent is not a later step is flagged."""
    engine, log = make_engine(protocol)
    # Step 1 (buffer_a) due; lift+pour reagent_b (not a prior/next buffer_a add
    # match is reagent_b at step 3, so it advances to step 3). To exercise the
    # "no later add" branch, pour buffer_a wrongly later is not possible, so we
    # instead verify a wrong pour at the last add.
    # Drive to step 5 cleanly.
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(spoken_mixed(3.0))
    engine.handle_event(lifted("reagent_b", 4.0))
    engine.handle_event(over_target("reagent_b", 5.0))
    engine.handle_event(lifted("stop", 10.0))  # completes incubate
    # At step 5 (stop due), lift+pour buffer_a (wrong, no later add uses it).
    engine.handle_event(lifted("buffer_a", 11.0))
    assert len(log.by_type(EV_DEVIATION)) >= 1
    engine.handle_event(over_target("buffer_a", 12.0))
    step5 = [e for e in log.by_type(EV_STEP_COMPLETED) if e.step_id == 5]
    assert len(step5) == 1
    assert step5[0].payload.get("deviation") is True


# --------------------------------------------------------------------------
# (d) Incubate warns at 50s and overruns past 60s
# --------------------------------------------------------------------------
def test_incubate_warning_and_overrun(protocol):
    clock = Clock()
    engine, log = make_engine(protocol, clock)

    # Complete steps 1-3 so the incubation timer starts at t=0.
    clock.set(0.0)
    engine.handle_event(lifted("buffer_a", 0.0))
    engine.handle_event(over_target("buffer_a", 0.0))
    engine.handle_event(spoken_mixed(0.0))
    engine.handle_event(lifted("reagent_b", 0.0))
    engine.handle_event(over_target("reagent_b", 0.0))
    # Incubate (step 4) is now due, timer running from t=0.
    assert engine.current_step.id == 4

    # Tick before the warn threshold: nothing.
    assert engine.tick(49.0) == []

    # Tick at the warn threshold: one timer_warning.
    produced = engine.tick(50.0)
    warnings = [e for e in produced if e.type == EV_TIMER_WARNING]
    assert len(warnings) == 1
    assert warnings[0].step_id == 4
    assert warnings[0].payload["warn_at_s"] == 50

    # Warning is one-shot: ticking again does not re-warn.
    assert engine.tick(55.0) == []
    assert len(log.by_type(EV_TIMER_WARNING)) == 1

    # The next action (lifting stop) happens past the 60s duration -> overrun.
    clock.set(65.0)
    engine.handle_event(lifted("stop", 65.0))
    overruns = log.by_type(EV_TIMER_OVERRUN)
    assert len(overruns) == 1
    assert overruns[0].step_id == 4
    assert overruns[0].payload["duration_s"] == 60
    assert overruns[0].payload["overrun_s"] == pytest.approx(5.0)

    # Finish step 5.
    engine.handle_event(over_target("stop", 66.0))
    assert [e.step_id for e in log.by_type(EV_STEP_COMPLETED)] == [1, 2, 3, 4, 5]


def test_incubate_no_overrun_when_on_time(protocol):
    clock = Clock()
    engine, log = make_engine(protocol, clock)
    engine.handle_event(lifted("buffer_a", 0.0))
    engine.handle_event(over_target("buffer_a", 0.0))
    engine.handle_event(spoken_mixed(0.0))
    engine.handle_event(lifted("reagent_b", 0.0))
    engine.handle_event(over_target("reagent_b", 0.0))

    engine.tick(50.0)  # warning
    # Next action within the duration: no overrun.
    engine.handle_event(lifted("stop", 58.0))
    assert log.by_type(EV_TIMER_OVERRUN) == []


# --------------------------------------------------------------------------
# (e) Mix / manual auto-advance
# --------------------------------------------------------------------------
def test_mix_auto_advance_via_spoken_signal(protocol):
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    assert engine.current_step.id == 2  # mix due
    engine.handle_event(spoken_mixed(3.0))
    assert engine.current_step.id == 3  # advanced to reagent_b
    assert 2 in [e.step_id for e in log.by_type(EV_STEP_COMPLETED)]


# --------------------------------------------------------------------------
# (f) Correction reassignment
# --------------------------------------------------------------------------
def test_apply_correction_reassigns_recorded_step(protocol):
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    assert engine.completed[1] == "buffer_a"

    produced = engine.apply_correction(step_id=1, reagent_key="reagent_b", timestamp=9.0)
    assert len(produced) == 1
    assert produced[0].type == EV_CORRECTION_APPLIED
    assert produced[0].payload["previous_reagent"] == "buffer_a"
    assert produced[0].payload["reagent"] == "reagent_b"
    assert engine.completed[1] == "reagent_b"


def test_correction_via_event(protocol):
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))

    corr = Event(
        source="user",
        type="correction",
        step_id=1,
        payload={"reagent": "stop"},
        timestamp=5.0,
    )
    produced = engine.handle_event(corr)
    assert any(e.type == EV_CORRECTION_APPLIED for e in produced)
    assert engine.completed[1] == "stop"


def test_correction_on_unknown_step_is_noop(protocol):
    engine, log = make_engine(protocol)
    produced = engine.apply_correction(step_id=99, reagent_key="buffer_a")
    assert produced == []


# --------------------------------------------------------------------------
# General invariants / wiring
# --------------------------------------------------------------------------
def test_engine_emits_only_engine_source_events(protocol):
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    for e in log.events:
        assert e.source == "engine"


def test_emit_callback_receives_events(protocol):
    received = []
    engine = ProtocolEngine(protocol, emit=received.append, clock=Clock())
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    assert any(e.type == EV_STEP_COMPLETED for e in received)


def test_events_ignored_after_finish(protocol):
    engine, log = make_engine(protocol)
    engine.handle_event(lifted("buffer_a", 1.0))
    engine.handle_event(over_target("buffer_a", 2.0))
    engine.handle_event(spoken_mixed(3.0))
    engine.handle_event(lifted("reagent_b", 4.0))
    engine.handle_event(over_target("reagent_b", 5.0))
    engine.handle_event(lifted("stop", 6.0))
    engine.handle_event(over_target("stop", 7.0))
    assert engine.finished is True
    n = len(log.events)
    # Further events are ignored.
    engine.handle_event(lifted("buffer_a", 8.0))
    assert len(log.events) == n


def test_requires_log_or_emit(protocol):
    with pytest.raises(ValueError):
        ProtocolEngine(protocol)
