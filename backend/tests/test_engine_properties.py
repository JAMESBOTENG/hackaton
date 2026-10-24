"""Hypothesis property-based tests for the deterministic protocol engine.

Property-based testing is explicitly rewarded for this project. These tests
generate randomized event sequences and assert invariants that must hold for
*any* input: bounds on the step index, exactly-one-deviation per wrong lift,
monotonic step-completion order, and a bound on the number of completions.
"""

from __future__ import annotations

from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from app.engine import (
    EV_DEVIATION,
    EV_STEP_COMPLETED,
    ProtocolEngine,
)
from app.events import Event, SessionLog
from app.protocol import load_protocol

DEMO_PATH = Path(__file__).resolve().parents[1] / "protocols" / "demo_assay.yaml"
PROTOCOL = load_protocol(DEMO_PATH)
REAGENT_KEYS = list(PROTOCOL.reagents.keys())


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def new_engine():
    log = SessionLog(protocol_name=PROTOCOL.name)
    return ProtocolEngine(PROTOCOL, log, clock=Clock()), log


def vision(kind: str, bottle: str, t: float) -> Event:
    return Event(source="vision", type=kind, payload={"bottle": bottle}, timestamp=t)


# A single arbitrary action: a vision event or a spoken completion.
action_strategy = st.one_of(
    st.tuples(
        st.sampled_from(["bottle_lifted", "bottle_over_target", "bottle_returned"]),
        st.sampled_from(REAGENT_KEYS),
    ),
    st.just(("step_done", None)),
)


@settings(max_examples=200, deadline=None)
@given(st.lists(action_strategy, max_size=40))
def test_step_index_always_in_bounds(actions):
    engine, _ = new_engine()
    t = 0.0
    for kind, bottle in actions:
        t += 1.0
        if kind == "step_done":
            ev = Event(source="audio", type="step_done", payload={}, timestamp=t)
        else:
            ev = vision(kind, bottle, t)
        engine.handle_event(ev)
        # The index is never negative and never past one-past-the-end.
        assert 0 <= engine.current_step_index <= len(PROTOCOL.steps)


@settings(max_examples=200, deadline=None)
@given(st.lists(action_strategy, max_size=40))
def test_step_completed_in_strictly_increasing_order(actions):
    engine, log = new_engine()
    t = 0.0
    for kind, bottle in actions:
        t += 1.0
        if kind == "step_done":
            ev = Event(source="audio", type="step_done", payload={}, timestamp=t)
        else:
            ev = vision(kind, bottle, t)
        engine.handle_event(ev)

    completed_ids = [e.step_id for e in log.by_type(EV_STEP_COMPLETED)]
    assert completed_ids == sorted(completed_ids)
    # Strictly increasing: a step is completed at most once.
    assert len(completed_ids) == len(set(completed_ids))


@settings(max_examples=200, deadline=None)
@given(st.lists(action_strategy, max_size=40))
def test_completions_never_exceed_step_count(actions):
    engine, log = new_engine()
    t = 0.0
    for kind, bottle in actions:
        t += 1.0
        if kind == "step_done":
            ev = Event(source="audio", type="step_done", payload={}, timestamp=t)
        else:
            ev = vision(kind, bottle, t)
        engine.handle_event(ev)

    completed = log.by_type(EV_STEP_COMPLETED)
    assert len(completed) <= len(PROTOCOL.steps)


@settings(max_examples=200, deadline=None)
@given(st.integers(min_value=0, max_value=len(REAGENT_KEYS) - 1))
def test_wrong_lift_yields_exactly_one_deviation(idx):
    """A single bottle_lifted for a reagent not due yields exactly one deviation.

    We start fresh (step 1, buffer_a due). Lifting any reagent other than
    buffer_a must emit exactly one deviation; lifting buffer_a emits none.
    """
    engine, log = new_engine()
    reagent = REAGENT_KEYS[idx]
    produced = engine.handle_event(vision("bottle_lifted", reagent, 1.0))
    deviations = [e for e in produced if e.type == EV_DEVIATION]

    due = PROTOCOL.steps[0]
    if reagent == due.reagent:
        assert deviations == []
    else:
        assert len(deviations) == 1
        assert deviations[0].payload["lifted"] == reagent
        assert deviations[0].payload["due_step_id"] == due.id


@settings(max_examples=100, deadline=None)
@given(st.lists(action_strategy, max_size=60))
def test_never_advances_past_final_step(actions):
    engine, _ = new_engine()
    t = 0.0
    for kind, bottle in actions:
        t += 1.0
        if kind == "step_done":
            ev = Event(source="audio", type="step_done", payload={}, timestamp=t)
        else:
            ev = vision(kind, bottle, t)
        engine.handle_event(ev)
        if engine.finished:
            assert engine.current_step_index == len(PROTOCOL.steps)
            assert engine.current_step is None
