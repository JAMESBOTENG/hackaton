"""End-of-session report generation from the event log.

The event log (:class:`~app.events.SessionLog`) is the single source of truth.
This module derives two things from it, entirely from the recorded events:

* a **Methods** section written in standard scientific prose describing the
  steps that were actually performed, in order (which reagents were added and in
  what order, the incubation time actually observed), and
* a **Deviation report** enumerating every flagged deviation, timer overrun and
  attached spoken observation/correction, each with an ISO-8601 timestamp and
  the associated step.

Two important invariants shape this module:

* **Language-only LLM.** The prose Methods section may be written by the LLM
  (:func:`app.llm.write_report`), but the engine's decisions (matching, timers,
  ordering) are never LLM-driven; the report only reads what the deterministic
  engine recorded. When the Anthropic API is unavailable (no key, no network)
  report generation MUST still produce a complete, correct report. The default
  path in the sandbox is therefore the deterministic local formatter below.
* **Replayable log.** :func:`load_session` reconstructs a ``SessionLog`` from the
  JSON saved on session end, proving the log alone is sufficient to regenerate
  both the timeline and the report.

Markdown is the primary export. PDF export is optional and guarded so its
absence never breaks the Markdown path or the test suite.
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Any, List, Optional, Union

from . import llm
from .events import Event, SessionLog
from .protocol import Protocol

# Location of the checked-in fixtures (canned report + demo session log).
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
CANNED_REPORT_PATH = FIXTURES_DIR / "canned_report.md"
DEMO_SESSION_PATH = FIXTURES_DIR / "demo_session.json"


# --------------------------------------------------------------------------- #
# Timestamp helpers.
# --------------------------------------------------------------------------- #
def iso_timestamp(epoch: Optional[float]) -> str:
    """Render an epoch-seconds timestamp as an ISO-8601 UTC string.

    Returns ``"unknown"`` when no timestamp is available so the report never
    crashes on a malformed event.
    """
    if epoch is None:
        return "unknown"
    try:
        dt = _dt.datetime.fromtimestamp(float(epoch), tz=_dt.timezone.utc)
    except (ValueError, OverflowError, OSError):
        return "unknown"
    return dt.isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Deterministic local formatter (the canned fallback + sandbox default).
# --------------------------------------------------------------------------- #
def _reagent_label(protocol: Protocol, reagent_key: Optional[str]) -> str:
    if not reagent_key:
        return "an unspecified reagent"
    reagent = protocol.reagent_for(reagent_key)
    return reagent.label if reagent is not None else reagent_key


def _methods_prose(session_log: SessionLog, protocol: Protocol) -> str:
    """Scientific-prose Methods paragraph derived from completed steps.

    Describes what the scientist *actually did* (reagents added in order, the
    observed incubation time), reading the ``step_completed`` records emitted by
    the deterministic engine. This is the canned fallback; it is complete on its
    own and is what runs in the demo when the LLM is unavailable.
    """
    completed = session_log.by_type("step_completed")
    overruns = {e.step_id: e for e in session_log.by_type("timer_overrun")}

    if not completed:
        return (
            f"No steps of the {protocol.name} protocol were recorded as "
            "performed during this session."
        )

    sentences: List[str] = []
    for event in completed:
        payload = event.payload or {}
        step_type = payload.get("step_type")
        description = (payload.get("description") or "").strip()
        reagent_key = payload.get("reagent")

        if step_type == "add":
            reagent = _reagent_label(protocol, reagent_key)
            sentence = f"{reagent} was added to the sample"
        elif step_type == "incubate":
            step = protocol.step_by_id(event.step_id) if event.step_id else None
            duration = step.duration_s if step is not None else None
            overrun = overruns.get(event.step_id)
            if overrun is not None:
                elapsed = (overrun.payload or {}).get("elapsed_s")
                sentence = (
                    "the sample was incubated for approximately "
                    f"{_fmt_seconds(elapsed)} "
                    f"(nominal {_fmt_seconds(duration)})"
                )
            elif duration is not None:
                sentence = f"the sample was incubated for {_fmt_seconds(duration)}"
            else:
                sentence = "the sample was incubated"
        elif step_type == "mix":
            sentence = "the sample was mixed"
        else:
            sentence = description.lower() if description else f"step {event.step_id} was performed"

        if payload.get("deviation"):
            expected = _reagent_label(protocol, payload.get("expected_reagent"))
            sentence += f" (deviation: {expected} was expected at this step)"

        sentences.append(sentence)

    # Join the ordered actions into a single flowing methods paragraph.
    body = _join_prose(sentences)
    return f"Following the {protocol.name} protocol, {body}."


def _fmt_seconds(value: Optional[float]) -> str:
    if value is None:
        return "an unspecified time"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "an unspecified time"
    if v.is_integer():
        return f"{int(v)} s"
    return f"{v:.1f} s"


def _join_prose(items: List[str]) -> str:
    """Join action clauses into readable prose: 'a; then b; then c'."""
    items = [s for s in items if s]
    if not items:
        return "no actions were recorded"
    if len(items) == 1:
        return items[0]
    return items[0] + "".join(f"; then {s}" for s in items[1:])


def _deviation_report(session_log: SessionLog, protocol: Protocol) -> str:
    """Markdown listing every deviation, overrun and observation with timestamps.

    Each entry carries an ISO-8601 timestamp and the associated step id so the
    report is fully traceable back to the event log.
    """
    deviations = session_log.by_type("deviation")
    overruns = session_log.by_type("timer_overrun")
    warnings = session_log.by_type("timer_warning")
    observations = session_log.by_type("observation")
    corrections = session_log.by_type("correction_applied")
    skipped = session_log.by_type("step_skipped")

    lines: List[str] = []

    if not any(
        [deviations, overruns, warnings, observations, corrections, skipped]
    ):
        lines.append("No deviations, timer overruns or observations were recorded.")
        return "\n".join(lines)

    if deviations:
        lines.append("### Deviations")
        for e in deviations:
            payload = e.payload or {}
            message = payload.get("message") or (
                f"{payload.get('lifted_label') or payload.get('lifted')} was lifted "
                f"instead of {payload.get('expected_label') or payload.get('expected')}"
            )
            lines.append(
                f"- `{iso_timestamp(e.timestamp)}` (step {e.step_id}): {message}"
            )
        lines.append("")

    if skipped:
        lines.append("### Skipped steps")
        for e in skipped:
            payload = e.payload or {}
            description = (payload.get("description") or "").strip()
            reason = payload.get("reason") or "skipped"
            label = description or f"step {e.step_id}"
            lines.append(
                f"- `{iso_timestamp(e.timestamp)}` (step {e.step_id}): "
                f"{label} was skipped ({reason})"
            )
        lines.append("")

    if warnings or overruns:
        lines.append("### Timing")
        for e in warnings:
            payload = e.payload or {}
            message = payload.get("message") or (
                f"incubation reached {payload.get('warn_at_s')}s"
            )
            lines.append(
                f"- `{iso_timestamp(e.timestamp)}` (step {e.step_id}): warning - {message}"
            )
        for e in overruns:
            payload = e.payload or {}
            message = payload.get("message") or (
                f"incubation overran by {payload.get('overrun_s')}s"
            )
            lines.append(
                f"- `{iso_timestamp(e.timestamp)}` (step {e.step_id}): overrun - {message}"
            )
        lines.append("")

    if observations:
        lines.append("### Observations")
        for e in observations:
            text = (e.payload or {}).get("text") or ""
            lines.append(
                f"- `{iso_timestamp(e.timestamp)}` (step {e.step_id}): \"{text}\""
            )
        lines.append("")

    if corrections:
        lines.append("### Corrections")
        for e in corrections:
            payload = e.payload or {}
            lines.append(
                f"- `{iso_timestamp(e.timestamp)}` (step {e.step_id}): reassigned "
                f"{_reagent_label(protocol, payload.get('previous_reagent'))} -> "
                f"{_reagent_label(protocol, payload.get('reagent'))}"
            )
        lines.append("")

    return "\n".join(lines).rstrip()


def deterministic_report(session_log: SessionLog, protocol: Protocol) -> str:
    """Assemble the full deterministic Markdown report from the event log.

    This is the canned fallback and the default path in the sandbox: it needs no
    network and no API key, and it satisfies every acceptance criterion
    (methods section + deviation report with ISO timestamps and step ids).
    """
    name = protocol.name
    methods = _methods_prose(session_log, protocol)
    deviations = _deviation_report(session_log, protocol)
    return (
        f"# Benchwatch report: {name}\n\n"
        f"## Methods\n\n{methods}\n\n"
        f"## Deviation report\n\n{deviations}\n"
    )


# --------------------------------------------------------------------------- #
# Public report assembly (LLM-preferred, deterministic fallback).
# --------------------------------------------------------------------------- #
def generate_report(
    session_log: SessionLog,
    protocol: Protocol,
    *,
    client: Optional[Any] = None,
    use_llm: bool = True,
) -> str:
    """Generate the end-of-session Markdown report from the event log.

    The report always contains a clearly delimited Methods section and a
    Deviation report (with ISO-8601 timestamps and step ids for every
    deviation, timer overrun and observation).

    When ``use_llm`` is true and the Anthropic API is available, the prose
    Methods section is written by :func:`app.llm.write_report` (language-only
    use of the model). On ANY failure, or when the API key is unset, the
    deterministic local formatter is used instead. The deterministic report is
    complete on its own, so a missing key or offline venue never breaks report
    generation.
    """
    if use_llm:
        try:
            prose = llm.write_report(session_log, protocol, client=client)
        except Exception:
            prose = None
        # Only accept the LLM output if it is a non-trivial string that is not
        # itself the deterministic canned fallback (which llm.fallback_report
        # may return). Otherwise use our richer deterministic report so the
        # timestamps + per-step enumeration required are always present.
        if (
            prose
            and isinstance(prose, str)
            and "## Deviation report" not in prose
            and not prose.startswith("# Benchwatch report")
        ):
            # Append our deterministic deviation report so timestamps + step ids
            # are always present even behind an LLM methods section.
            deviations = _deviation_report(session_log, protocol)
            prose = prose.rstrip()
            if "## Deviation" not in prose and "## Deviations" not in prose:
                return prose + "\n\n## Deviation report\n\n" + deviations + "\n"
            return prose + "\n"
    return deterministic_report(session_log, protocol)


# --------------------------------------------------------------------------- #
# Markdown export.
# --------------------------------------------------------------------------- #
def export_markdown(
    markdown: str, path: Union[str, Path]
) -> Path:
    """Write ``markdown`` to ``path`` (creating parents) and return the path."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(markdown, encoding="utf-8")
    return p


def export_report_markdown(
    session_log: SessionLog,
    protocol: Protocol,
    path: Union[str, Path],
    *,
    client: Optional[Any] = None,
    use_llm: bool = True,
) -> str:
    """Generate the report, write it to ``path`` as Markdown, and return the text."""
    markdown = generate_report(
        session_log, protocol, client=client, use_llm=use_llm
    )
    export_markdown(markdown, path)
    return markdown


def export_pdf(markdown: str, path: Union[str, Path]) -> Optional[Path]:
    """Best-effort PDF export of a Markdown report.

    PDF export is OPTIONAL. If no lightweight PDF library is installed this
    returns ``None`` without raising, so the absence of a PDF backend never
    breaks Markdown export or the test suite. We do not add a hard PDF
    dependency to the base install (see ``requirements-optional.txt``).
    """
    try:  # Prefer a tiny pure-Python renderer if present.
        from fpdf import FPDF  # type: ignore
    except Exception:
        return None
    try:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        pdf.set_font("Helvetica", size=11)
        for line in markdown.splitlines():
            # FPDF's core fonts are latin-1 only; drop anything it cannot encode.
            safe = line.encode("latin-1", "replace").decode("latin-1")
            pdf.multi_cell(0, 6, safe)
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        pdf.output(str(out))
        return out
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Session-log replay (proves the log is a sufficient single source of truth).
# --------------------------------------------------------------------------- #
def load_session(json_path: Union[str, Path]) -> SessionLog:
    """Reconstruct a :class:`SessionLog` from a saved JSON log.

    The returned log is equivalent to the one that produced the file, so the
    timeline and the report can both be regenerated from it alone.
    """
    return SessionLog.load_json(json_path)


def replay_events(session_log: SessionLog) -> List[Event]:
    """Return the ordered events of a loaded log (the replayable timeline).

    Exposed so a caller (UI, a ``/replay`` endpoint or a CLI) can walk the
    recorded events to rebuild the timeline, confirming the log alone is enough.
    """
    return list(session_log.events)


def regenerate_report(
    json_path: Union[str, Path],
    protocol: Protocol,
    *,
    use_llm: bool = False,
) -> str:
    """Load a saved session log and regenerate its Markdown report.

    Defaults to the deterministic path (``use_llm=False``) so replay is
    reproducible and never depends on the network.
    """
    log = load_session(json_path)
    return generate_report(log, protocol, use_llm=use_llm)


# --------------------------------------------------------------------------- #
# Canned fixture access.
# --------------------------------------------------------------------------- #
def canned_report() -> str:
    """Return the checked-in canned report fixture (demo wifi-failure fallback)."""
    return CANNED_REPORT_PATH.read_text(encoding="utf-8")
