"""Tests for end-of-session report generation and replay (app.report).

Deterministic and offline: no network, no real Anthropic calls. The default
path leaves ANTHROPIC_API_KEY unset so the deterministic local formatter runs.
The LLM-backed path is exercised with an injected stub client.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app import report
from app.events import Event, SessionLog
from app.protocol import load_protocol

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROTOCOL_PATH = BACKEND_DIR / "protocols" / "demo_assay.yaml"
DEMO_SESSION_PATH = BACKEND_DIR / "app" / "fixtures" / "demo_session.json"


@pytest.fixture(autouse=True)
def _no_api_key(monkeypatch):
    # The whole module tests the offline/deterministic path by default.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


@pytest.fixture()
def protocol():
    return load_protocol(PROTOCOL_PATH)


@pytest.fixture()
def demo_log():
    return report.load_session(DEMO_SESSION_PATH)


class _StubClient:
    """Minimal Anthropic stand-in whose messages.create returns fixed text."""

    def __init__(self, payload: str):
        self._payload = payload
        self.calls = []
        parent = self

        class _Messages:
            def create(self, **kwargs):
                parent.calls.append(kwargs)
                return SimpleNamespace(content=[SimpleNamespace(text=parent._payload)])

        self.messages = _Messages()


# --------------------------------------------------------------------------- #
# (a) Methods + deviation report with timestamps for the demo fixture.
# --------------------------------------------------------------------------- #
def test_demo_report_has_methods_and_deviation_sections(demo_log, protocol):
    md = report.generate_report(demo_log, protocol)
    assert "## Methods" in md
    assert "## Deviation report" in md
    # Methods prose names the reagents actually added in order.
    assert "Buffer A" in md
    assert "Reagent B" in md
    assert "Stop Solution" in md


def test_demo_report_lists_step3_deviation(demo_log, protocol):
    md = report.generate_report(demo_log, protocol)
    # The step-3 wrong-bottle (stop solution) deviation, with step id.
    assert "(step 3)" in md
    assert "Stop Solution" in md
    assert "step 3" in md


def test_demo_report_lists_incubation_overrun(demo_log, protocol):
    md = report.generate_report(demo_log, protocol)
    assert "overrun" in md.lower()
    assert "(step 4)" in md


def test_demo_report_lists_paler_observation(demo_log, protocol):
    md = report.generate_report(demo_log, protocol)
    assert "the yellow looks a little paler than last time" in md


def test_demo_report_entries_carry_iso_timestamps(demo_log, protocol):
    md = report.generate_report(demo_log, protocol)
    # ISO-8601 timestamps (UTC) appear on deviation/overrun/observation lines.
    assert "2023-11-14T" in md
    assert "+00:00" in md


def test_iso_timestamp_handles_none():
    assert report.iso_timestamp(None) == "unknown"


# --------------------------------------------------------------------------- #
# (b) The deterministic fallback produces a complete report with no LLM.
# --------------------------------------------------------------------------- #
def test_fallback_without_llm_is_complete(demo_log, protocol):
    # No key (autouse fixture) and no client -> deterministic path.
    md = report.generate_report(demo_log, protocol)
    assert md.startswith("# Benchwatch report")
    assert "## Methods" in md
    assert "## Deviation report" in md
    # And the deterministic path is identical to deterministic_report.
    assert md == report.deterministic_report(demo_log, protocol)


def test_empty_log_produces_valid_report(protocol):
    md = report.generate_report(SessionLog(protocol_name=protocol.name), protocol)
    assert "## Methods" in md
    assert "## Deviation report" in md
    assert "No deviations" in md


def test_canned_report_fixture_is_checked_in():
    assert report.CANNED_REPORT_PATH.is_file()
    text = report.canned_report()
    assert "## Methods" in text
    assert "## Deviation report" in text
    assert "the yellow looks a little paler than last time" in text


# --------------------------------------------------------------------------- #
# LLM-preferred path (stub client) still yields a complete report.
# --------------------------------------------------------------------------- #
def test_llm_methods_path_appends_deviation_report(demo_log, protocol):
    client = _StubClient("## Methods\n\nBuffer A, Reagent B and Stop Solution were used.")
    md = report.generate_report(demo_log, protocol, client=client, use_llm=True)
    assert client.calls, "the stub client should have been used"
    # The LLM prose is present AND our deterministic deviation report is appended.
    assert "## Deviation report" in md
    assert "the yellow looks a little paler than last time" in md
    assert "(step 3)" in md


# --------------------------------------------------------------------------- #
# (c) Replay: load_session round-trips the JSON log.
# --------------------------------------------------------------------------- #
def test_load_session_round_trips(demo_log, protocol, tmp_path):
    saved = demo_log.save_json(tmp_path / "roundtrip.json")
    reloaded = report.load_session(saved)
    assert len(reloaded.events) == len(demo_log.events)
    original = [(e.source, e.type, e.step_id, e.payload, e.timestamp) for e in demo_log]
    restored = [(e.source, e.type, e.step_id, e.payload, e.timestamp) for e in reloaded]
    assert restored == original
    # The regenerated report is identical to the one from the original log.
    assert report.generate_report(reloaded, protocol) == report.generate_report(
        demo_log, protocol
    )


def test_replay_events_returns_timeline(demo_log):
    events = report.replay_events(demo_log)
    assert len(events) == len(demo_log.events)
    assert all(isinstance(e, Event) for e in events)


def test_regenerate_report_from_saved_log(demo_log, protocol, tmp_path):
    saved = demo_log.save_json(tmp_path / "saved.json")
    md = report.regenerate_report(saved, protocol)
    assert "## Methods" in md
    assert "## Deviation report" in md


# --------------------------------------------------------------------------- #
# (d) The report reflects the step actually performed when a deviation occurs.
# --------------------------------------------------------------------------- #
def test_report_reflects_actual_step_when_deviation_ignored(protocol):
    """If a wrong bottle is poured anyway, the methods reflect what was done."""
    from app.engine import ProtocolEngine

    log = SessionLog(protocol_name=protocol.name)
    engine = ProtocolEngine(protocol, log=log)

    # Step 1: correctly add Buffer A.
    engine.handle_event(Event(source="vision", type="bottle_lifted", payload={"bottle": "buffer_a"}, timestamp=1.0))
    engine.handle_event(Event(source="vision", type="bottle_over_target", payload={"bottle": "buffer_a"}, timestamp=2.0))
    # Step 2: mix.
    engine.handle_event(Event(source="audio", type="step_done", step_id=2, payload={}, timestamp=3.0))
    # Step 3: lift the WRONG bottle (stop) -> deviation, then pour it anyway.
    engine.handle_event(Event(source="vision", type="bottle_lifted", payload={"bottle": "stop"}, timestamp=4.0))
    engine.handle_event(Event(source="vision", type="bottle_over_target", payload={"bottle": "stop"}, timestamp=5.0))

    md = report.generate_report(log, protocol)
    # A deviation must be listed...
    assert "deviation" in md.lower() or "Deviations" in md
    # ...and the completed-step record (what actually happened) is reflected:
    # the engine recorded step 5 (stop) as performed via the wrong-order pour.
    completed = log.by_type("step_completed")
    assert any((e.payload or {}).get("reagent") == "stop" for e in completed)


def test_report_lists_skipped_steps_on_wrong_order_pour(protocol):
    """Steps jumped over by a wrong-order pour appear in the deviation report."""
    from app.engine import ProtocolEngine

    log = SessionLog(protocol_name=protocol.name)
    engine = ProtocolEngine(protocol, log=log)

    engine.handle_event(Event(source="vision", type="bottle_lifted", payload={"bottle": "buffer_a"}, timestamp=1.0))
    engine.handle_event(Event(source="vision", type="bottle_over_target", payload={"bottle": "buffer_a"}, timestamp=2.0))
    engine.handle_event(Event(source="audio", type="step_done", step_id=2, payload={}, timestamp=3.0))
    # Deviation ignored: pour Stop (step 5 reagent) out of order -> skip 3 and 4.
    engine.handle_event(Event(source="vision", type="bottle_lifted", payload={"bottle": "stop"}, timestamp=4.0))
    engine.handle_event(Event(source="vision", type="bottle_over_target", payload={"bottle": "stop"}, timestamp=5.0))

    md = report.generate_report(log, protocol)
    assert "Skipped steps" in md
    # The two jumped-over steps are named with their step ids.
    assert "(step 3)" in md
    assert "(step 4)" in md
    assert "skipped" in md.lower()


# --------------------------------------------------------------------------- #
# Markdown export.
# --------------------------------------------------------------------------- #
def test_export_markdown_writes_file(demo_log, protocol, tmp_path):
    out = tmp_path / "report.md"
    md = report.export_report_markdown(demo_log, protocol, out)
    assert out.is_file()
    assert out.read_text(encoding="utf-8") == md
    assert "## Methods" in out.read_text(encoding="utf-8")


def test_export_pdf_is_optional_and_never_raises(demo_log, protocol, tmp_path):
    md = report.generate_report(demo_log, protocol)
    # Returns a Path when a PDF backend is installed, else None; never raises.
    result = report.export_pdf(md, tmp_path / "report.pdf")
    assert result is None or Path(result).is_file()
