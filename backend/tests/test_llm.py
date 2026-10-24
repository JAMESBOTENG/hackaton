"""Tests for the language layer (app.llm).

No real network and no real Anthropic calls: the client is stubbed. The
deterministic fallback path is tested by leaving ANTHROPIC_API_KEY unset.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.engine import ProtocolEngine
from app.events import SessionLog
from app.llm import (
    KIND_CHATTER,
    KIND_CORRECTION,
    KIND_OBSERVATION,
    KIND_QUESTION,
    VALID_KINDS,
    classify_segment,
    fallback_classify,
    fallback_report,
    write_report,
)
from app.protocol import load_protocol

PROTOCOL_PATH = (
    Path(__file__).resolve().parent.parent / "protocols" / "demo_assay.yaml"
)


@pytest.fixture()
def protocol():
    return load_protocol(PROTOCOL_PATH)


class _StubClient:
    """A minimal stand-in for an Anthropic client.

    ``messages.create(...)`` returns a response whose single content block text
    is the configured payload, so the parser exercises the real extraction.
    """

    def __init__(self, payload: str):
        self._payload = payload
        self.calls = []

        parent = self

        class _Messages:
            def create(self, **kwargs):
                parent.calls.append(kwargs)
                return SimpleNamespace(
                    content=[SimpleNamespace(text=parent._payload)]
                )

        self.messages = _Messages()


class _RaisingClient:
    def __init__(self):
        class _Messages:
            def create(self, **kwargs):
                raise RuntimeError("network down")

        self.messages = _Messages()


# --------------------------------------------------------------------------- #
# Classification with a stubbed client.
# --------------------------------------------------------------------------- #
def test_classify_observation_with_stub(protocol):
    payload = json.dumps(
        {
            "kind": "observation",
            "text": "that one looks a bit cloudy",
            "target_step_id": 3,
            "correction": None,
        }
    )
    client = _StubClient(payload)
    result = classify_segment(
        "that one looks a bit cloudy",
        current_step=3,
        protocol=protocol,
        client=client,
    )
    assert result["kind"] == KIND_OBSERVATION
    assert result["target_step_id"] == 3
    assert client.calls, "the stubbed client should have been called"


def test_classify_correction_resolves_reagent(protocol):
    payload = json.dumps(
        {
            "kind": "correction",
            "text": "no, that was buffer A",
            "target_step_id": 1,
            "correction": {"step_id": 1, "reagent_key": "buffer_a"},
        }
    )
    result = classify_segment(
        "no, that was buffer A",
        current_step=1,
        protocol=protocol,
        client=_StubClient(payload),
    )
    assert result["kind"] == KIND_CORRECTION
    assert result["correction"]["step_id"] == 1
    assert result["correction"]["reagent_key"] == "buffer_a"


def test_classify_question_with_stub(protocol):
    payload = json.dumps(
        {"kind": "question", "text": "how long do I incubate?", "correction": None}
    )
    result = classify_segment(
        "how long do I incubate?",
        current_step=4,
        protocol=protocol,
        client=_StubClient(payload),
    )
    assert result["kind"] == KIND_QUESTION


def test_classify_chatter_with_stub(protocol):
    payload = json.dumps({"kind": "chatter", "text": "lunch later?", "correction": None})
    result = classify_segment(
        "anyone want lunch later",
        current_step=2,
        protocol=protocol,
        client=_StubClient(payload),
    )
    assert result["kind"] == KIND_CHATTER


def test_classify_invalid_kind_falls_back(protocol):
    # The model returns an invalid 'kind'; we must fall back, not crash.
    client = _StubClient(json.dumps({"kind": "banana", "text": "x"}))
    result = classify_segment(
        "that looks cloudy", current_step=3, protocol=protocol, client=client
    )
    assert result["kind"] in VALID_KINDS


def test_classify_malformed_output_falls_back(protocol):
    client = _StubClient("this is not json at all")
    result = classify_segment(
        "the yellow looks a little paler than last time",
        current_step=3,
        protocol=protocol,
        client=client,
    )
    assert result["kind"] in VALID_KINDS


# --------------------------------------------------------------------------- #
# Fallback path (no key / client raises).
# --------------------------------------------------------------------------- #
def test_classify_no_key_uses_fallback(protocol, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # No client injected and no key -> deterministic fallback, no crash.
    result = classify_segment(
        "the yellow looks a little paler than last time",
        current_step=3,
        protocol=protocol,
    )
    assert result["kind"] == KIND_OBSERVATION
    assert result["target_step_id"] == 3


def test_classify_client_raises_uses_fallback(protocol):
    result = classify_segment(
        "no, that was buffer A",
        current_step=1,
        protocol=protocol,
        client=_RaisingClient(),
    )
    assert result["kind"] == KIND_CORRECTION
    assert result["correction"]["reagent_key"] == "buffer_a"


def test_fallback_classify_kinds(protocol):
    assert fallback_classify("that looks cloudy", 3, protocol)["kind"] == (
        KIND_OBSERVATION
    )
    assert fallback_classify("what step am I on?", 1, protocol)["kind"] == (
        KIND_QUESTION
    )
    assert fallback_classify("no, that was buffer A", 1, protocol)["kind"] == (
        KIND_CORRECTION
    )
    assert fallback_classify("", 1, protocol)["kind"] == KIND_CHATTER


def test_demo_observation_attaches_to_current_step(protocol):
    # The headline demo line must classify as an observation on the current
    # step (step 3), via the fallback (no API required).
    result = fallback_classify(
        "the yellow looks a little paler than last time", 3, protocol
    )
    assert result["kind"] == KIND_OBSERVATION
    assert result["target_step_id"] == 3


# --------------------------------------------------------------------------- #
# Correction classification applied through the deterministic engine.
# --------------------------------------------------------------------------- #
def test_correction_applied_through_engine(protocol):
    """A parsed correction, applied via the engine primitive, updates the log."""
    log = SessionLog(protocol_name=protocol.name)
    engine = ProtocolEngine(protocol, log=log)

    # Complete step 1 by lifting/pouring Buffer A (the expected reagent).
    from app.events import Event

    engine.handle_event(
        Event(source="vision", type="bottle_lifted", payload={"bottle": "buffer_a"}, timestamp=1.0)
    )
    engine.handle_event(
        Event(
            source="vision",
            type="bottle_over_target",
            payload={"bottle": "buffer_a"},
            timestamp=2.0,
        )
    )
    assert 1 in engine.completed
    assert engine.completed[1] == "buffer_a"

    # The scientist corrects step 1: 'no, that was the stop solution'.
    result = classify_segment(
        "no, that was the stop solution", current_step=1, protocol=protocol
    )
    assert result["kind"] == KIND_CORRECTION
    correction = result["correction"]
    assert correction["reagent_key"] == "stop"

    produced = engine.apply_correction(
        step_id=correction["step_id"], reagent_key=correction["reagent_key"]
    )
    assert produced, "apply_correction should emit a correction_applied event"
    assert engine.completed[1] == "stop"


# --------------------------------------------------------------------------- #
# Report generation.
# --------------------------------------------------------------------------- #
def test_write_report_uses_stub(protocol):
    log = SessionLog(protocol_name=protocol.name)
    log.add("engine", "step_completed", step_id=1, payload={"description": "Add Buffer A", "reagent": "buffer_a"})
    client = _StubClient("# Report\n\nMethods and deviations.")
    text = write_report(log, protocol, client=client)
    assert text.startswith("# Report")


def test_write_report_falls_back_without_key(protocol, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    log = SessionLog(protocol_name=protocol.name)
    log.add("engine", "step_completed", step_id=1, payload={"description": "Add Buffer A", "reagent": "buffer_a"})
    log.add("engine", "deviation", step_id=3, payload={"message": "wrong bottle"})
    text = write_report(log, protocol)  # no key, no client -> canned fallback
    assert "# Benchwatch report" in text
    assert "Methods" in text
    assert "Deviations" in text


def test_write_report_client_raises_falls_back(protocol):
    log = SessionLog(protocol_name=protocol.name)
    text = write_report(log, protocol, client=_RaisingClient())
    assert "# Benchwatch report" in text


def test_fallback_report_lists_observations(protocol):
    log = SessionLog(protocol_name=protocol.name)
    log.add("audio", "observation", step_id=3, payload={"text": "the yellow looks paler"})
    text = fallback_report(log, protocol)
    assert "Observations" in text
    assert "the yellow looks paler" in text
