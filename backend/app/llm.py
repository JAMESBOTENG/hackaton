"""Language layer: the ONLY place Benchwatch uses an LLM.

The deterministic protocol engine (``app.engine``) owns step matching, ordering
and timers. The LLM is used strictly for language:

* :func:`classify_segment` classifies a free-speech transcript segment as an
  ``observation`` (attach to the current step), a ``correction`` (reassign a
  previously recorded event), a ``question`` or irrelevant ``chatter`` and,
  for a correction, resolves which reagent and step it refers to.
* :func:`write_report` turns the full event log into the methods section +
  deviation report prose.

Both call the Anthropic SDK but NEVER drive control flow: a correction is only
ever applied through the engine's deterministic ``apply_correction`` primitive,
and classification never decides step order or timers.

Robustness (a load-bearing invariant): the venue wifi may fail and the
``ANTHROPIC_API_KEY`` may be unset. Every LLM call is guarded with a
deterministic local fallback:

* classification falls back to a keyword heuristic that still returns a valid
  ``kind`` and, where possible, resolves a correction's reagent;
* report generation falls back to a canned deterministic summary.

Nothing here raises to the caller on a missing key, a network error or
malformed model output.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from .events import Event, SessionLog
from .protocol import Protocol

# The strict set of classification kinds the rest of the system understands.
KIND_OBSERVATION = "observation"
KIND_CORRECTION = "correction"
KIND_QUESTION = "question"
KIND_CHATTER = "chatter"
VALID_KINDS = (KIND_OBSERVATION, KIND_CORRECTION, KIND_QUESTION, KIND_CHATTER)

# Model + key come from the environment (never hard-coded).
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
API_KEY_ENV = "ANTHROPIC_API_KEY"

_CLASSIFY_SYSTEM = (
    "You are the language layer of Benchwatch, a lab co-pilot. The deterministic "
    "engine already handles step matching, ordering and timers; you ONLY "
    "interpret language. Given a short spoken transcript segment from a "
    "scientist, classify it as exactly one of: 'observation' (a casual remark "
    "about the sample/reagents to attach to the current step, e.g. 'that looks a "
    "bit cloudy'), 'correction' (the scientist correcting what the system "
    "recorded, e.g. 'no, that was Buffer A'), 'question', or 'chatter' "
    "(irrelevant). Respond with STRICT JSON only, no prose, matching: "
    '{"kind": "observation|correction|question|chatter", "text": string, '
    '"target_step_id": number|null, "correction": {"step_id": number|null, '
    '"reagent_key": string|null}|null}. Use correction.reagent_key only for a '
    "reagent key from the provided protocol vocabulary."
)


# --------------------------------------------------------------------------- #
# Anthropic client access (lazy + guarded).
# --------------------------------------------------------------------------- #
def _get_client(client: Optional[Any] = None) -> Optional[Any]:
    """Return an Anthropic client, or ``None`` when unavailable.

    A client can be injected (tests pass a stub). Otherwise one is constructed
    from the SDK using ``ANTHROPIC_API_KEY``. Any failure (no key, SDK missing,
    construction error) returns ``None`` so callers fall back deterministically.
    """
    if client is not None:
        return client
    if not os.environ.get(API_KEY_ENV):
        return None
    try:
        import anthropic  # lazy import; absence must not crash the core

        return anthropic.Anthropic()
    except Exception:
        return None


def _extract_text(response: Any) -> str:
    """Pull the text out of an Anthropic ``messages.create`` response."""
    content = getattr(response, "content", None)
    if content is None and isinstance(response, dict):
        content = response.get("content")
    if not content:
        return ""
    parts: List[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            text = block.get("text")
        if text:
            parts.append(text)
    return "".join(parts).strip()


def _parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    """Parse the first JSON object found in ``text``; ``None`` if unparseable."""
    if not text:
        return None
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except Exception:
        pass
    # The model sometimes wraps JSON in prose/fences; grab the first {...} block.
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        obj = json.loads(match.group(0))
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Classification.
# --------------------------------------------------------------------------- #
def _reagent_vocab(protocol: Optional[Protocol]) -> Dict[str, str]:
    """Map each reagent key and its label (lowercased) to the reagent key."""
    vocab: Dict[str, str] = {}
    if protocol is None:
        return vocab
    for key, reagent in protocol.reagents.items():
        vocab[key.lower()] = key
        vocab[key.replace("_", " ").lower()] = key
        if reagent.label:
            vocab[reagent.label.lower()] = key
    return vocab


def _resolve_reagent(text: str, protocol: Optional[Protocol]) -> Optional[str]:
    """Best-effort resolve a reagent key mentioned in ``text`` (plain code)."""
    lower = text.lower()
    # Prefer the longest label match so 'stop solution' beats 'stop'.
    vocab = _reagent_vocab(protocol)
    for phrase in sorted(vocab.keys(), key=len, reverse=True):
        if phrase and phrase in lower:
            return vocab[phrase]
    return None


_CORRECTION_CUES = (
    "no, that was",
    "no that was",
    "actually that was",
    "that was actually",
    "i meant",
    "that was the",
    "correction",
    "that wasn't",
    "that was not",
)
_QUESTION_CUES = ("?",)
_QUESTION_WORDS = ("what", "when", "how", "why", "where", "which", "should i", "do i")
_OBSERVATION_CUES = (
    "looks",
    "looking",
    "seems",
    "cloudy",
    "clear",
    "paler",
    "darker",
    "lighter",
    "color",
    "colour",
    "using the",
    "new lot",
    "a bit",
    "a little",
)


def fallback_classify(
    segment_text: str,
    current_step: Optional[int] = None,
    protocol: Optional[Protocol] = None,
) -> Dict[str, Any]:
    """Deterministic keyword classifier used when the LLM is unavailable.

    Always returns a valid classification dict. This is the canned/local
    fallback that keeps the demo working when the venue wifi or the API key is
    missing. It never drives engine control flow; a resolved correction is still
    applied through the engine's ``apply_correction`` primitive by the caller.
    """
    text = (segment_text or "").strip()
    lower = text.lower()

    def result(
        kind: str,
        *,
        target_step_id: Optional[int] = None,
        correction: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "kind": kind,
            "text": text,
            "target_step_id": target_step_id,
            "correction": correction,
        }

    if not lower:
        return result(KIND_CHATTER)

    if any(cue in lower for cue in _CORRECTION_CUES):
        reagent_key = _resolve_reagent(text, protocol)
        return result(
            KIND_CORRECTION,
            target_step_id=current_step,
            correction={"step_id": current_step, "reagent_key": reagent_key},
        )

    if lower.endswith("?") or any(lower.startswith(w) for w in _QUESTION_WORDS):
        return result(KIND_QUESTION)

    if any(cue in lower for cue in _OBSERVATION_CUES):
        return result(KIND_OBSERVATION, target_step_id=current_step)

    return result(KIND_CHATTER)


def _validate_classification(
    obj: Optional[Dict[str, Any]],
    segment_text: str,
    current_step: Optional[int],
    protocol: Optional[Protocol],
) -> Optional[Dict[str, Any]]:
    """Coerce a raw model dict into the strict schema, or ``None`` if invalid."""
    if not isinstance(obj, dict):
        return None
    kind = obj.get("kind")
    if kind not in VALID_KINDS:
        return None

    text = obj.get("text")
    if not isinstance(text, str) or not text:
        text = (segment_text or "").strip()

    target_step_id = obj.get("target_step_id")
    if not isinstance(target_step_id, int):
        target_step_id = current_step if kind == KIND_OBSERVATION else None

    correction = None
    if kind == KIND_CORRECTION:
        raw = obj.get("correction") or {}
        step_id = raw.get("step_id") if isinstance(raw, dict) else None
        reagent_key = raw.get("reagent_key") if isinstance(raw, dict) else None
        if not isinstance(step_id, int):
            step_id = current_step
        # Validate the reagent key against the protocol; re-resolve if needed.
        if protocol is not None and reagent_key not in protocol.reagents:
            reagent_key = _resolve_reagent(text, protocol)
        if reagent_key is None:
            reagent_key = _resolve_reagent(text, protocol)
        correction = {"step_id": step_id, "reagent_key": reagent_key}

    return {
        "kind": kind,
        "text": text,
        "target_step_id": target_step_id,
        "correction": correction,
    }


def classify_segment(
    segment_text: str,
    current_step: Optional[int] = None,
    recent_events: Optional[List[Event]] = None,
    protocol: Optional[Protocol] = None,
    *,
    client: Optional[Any] = None,
    model: str = DEFAULT_MODEL,
) -> Dict[str, Any]:
    """Classify a transcript segment into the strict Benchwatch schema.

    Returns ``{"kind": one of VALID_KINDS, "text": str,
    "target_step_id": int|None, "correction": {"step_id", "reagent_key"}|None}``.

    Calls the Anthropic SDK (model/key from env, or an injected ``client``). On
    ANY failure (no key, network error, malformed/unparseable output or an
    invalid kind) it falls back to :func:`fallback_classify` so it always
    returns a valid kind and never raises.
    """
    llm = _get_client(client)
    if llm is not None:
        try:
            user = _build_classify_prompt(
                segment_text, current_step, recent_events, protocol
            )
            response = llm.messages.create(
                model=model,
                max_tokens=400,
                system=_CLASSIFY_SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
            parsed = _parse_json_object(_extract_text(response))
            validated = _validate_classification(
                parsed, segment_text, current_step, protocol
            )
            if validated is not None:
                return validated
        except Exception:
            # Network error, SDK error, malformed output: fall through.
            pass
    return fallback_classify(segment_text, current_step, protocol)


def _build_classify_prompt(
    segment_text: str,
    current_step: Optional[int],
    recent_events: Optional[List[Event]],
    protocol: Optional[Protocol],
) -> str:
    """Build the user message for classification (context for the model)."""
    lines: List[str] = []
    if protocol is not None:
        reagents = ", ".join(
            f"{key} ({r.label})" for key, r in protocol.reagents.items()
        )
        lines.append(f"Protocol reagents (key (label)): {reagents}.")
    lines.append(f"Current step id: {current_step}.")
    if recent_events:
        recent = [
            {"type": e.type, "step_id": e.step_id, "payload": e.payload}
            for e in recent_events[-5:]
        ]
        lines.append("Recent events: " + json.dumps(recent))
    lines.append(f"Transcript segment: {segment_text!r}")
    lines.append("Classify it. Respond with STRICT JSON only.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Report generation.
# --------------------------------------------------------------------------- #
_REPORT_SYSTEM = (
    "You are the language layer of Benchwatch. Given a completed session event "
    "log (the single source of truth) and the protocol, write a concise lab "
    "report in Markdown with two sections: a 'Methods' section describing the "
    "steps actually performed in order, and a 'Deviations' section listing any "
    "flagged deviations, timer overruns and spoken observations/corrections. Be "
    "factual and base everything strictly on the event log. Output Markdown only."
)


def write_report(
    session_log: SessionLog,
    protocol: Protocol,
    *,
    client: Optional[Any] = None,
    model: str = DEFAULT_MODEL,
) -> str:
    """Produce the methods + deviation report prose via Claude.

    This is the Claude-backed entry point consumed by FEAT-006's report
    assembly. On any failure (no key, network error, empty output) it delegates
    to the deterministic canned fallback :func:`fallback_report`, so a missing
    API key or offline venue never breaks report generation.
    """
    llm = _get_client(client)
    if llm is not None:
        try:
            user = _build_report_prompt(session_log, protocol)
            response = llm.messages.create(
                model=model,
                max_tokens=1500,
                system=_REPORT_SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
            text = _extract_text(response)
            if text:
                return text
        except Exception:
            pass
    return fallback_report(session_log, protocol)


def _build_report_prompt(session_log: SessionLog, protocol: Protocol) -> str:
    """Serialize the protocol + event log for the report prompt."""
    payload = {
        "protocol": {
            "name": protocol.name,
            "steps": [
                {
                    "id": s.id,
                    "type": s.type,
                    "description": s.description,
                    "reagent": s.reagent,
                }
                for s in protocol.steps
            ],
        },
        "events": [e.to_dict() for e in session_log.events],
    }
    return "Session data (JSON):\n" + json.dumps(payload, indent=2)


def fallback_report(session_log: SessionLog, protocol: Protocol) -> str:
    """Deterministic canned report used when the Anthropic API is unavailable.

    FEAT-006 owns the full report assembly/formatting in ``app.report``; this is
    the minimal, dependency-free Markdown fallback so the demo always produces a
    report even with no wifi or API key. Everything is derived from the event
    log (the single source of truth).
    """
    completed = session_log.by_type("step_completed")
    deviations = session_log.by_type("deviation")
    overruns = session_log.by_type("timer_overrun")
    observations = session_log.by_type("observation")
    corrections = session_log.by_type("correction_applied")

    lines: List[str] = [f"# Benchwatch report: {protocol.name}", ""]
    lines.append("## Methods")
    if completed:
        for e in completed:
            reagent = (e.payload or {}).get("reagent")
            desc = (e.payload or {}).get("description") or ""
            reagent_note = f" (reagent: {reagent})" if reagent else ""
            lines.append(f"- Step {e.step_id}: {desc}{reagent_note}")
    else:
        lines.append("- No steps were completed in this session.")
    lines.append("")

    lines.append("## Deviations")
    if not deviations and not overruns:
        lines.append("- No deviations or timer overruns were flagged.")
    for e in deviations:
        msg = (e.payload or {}).get("message") or "deviation"
        lines.append(f"- Deviation (step {e.step_id}): {msg}")
    for e in overruns:
        msg = (e.payload or {}).get("message") or "timer overrun"
        lines.append(f"- Timer overrun (step {e.step_id}): {msg}")
    lines.append("")

    if observations:
        lines.append("## Observations")
        for e in observations:
            text = (e.payload or {}).get("text") or ""
            lines.append(f"- Step {e.step_id}: {text}")
        lines.append("")

    if corrections:
        lines.append("## Corrections")
        for e in corrections:
            payload = e.payload or {}
            lines.append(
                f"- Step {e.step_id}: reassigned "
                f"{payload.get('previous_reagent')} -> {payload.get('reagent')}"
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"
