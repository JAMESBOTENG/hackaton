---
inclusion: always
---

# Benchwatch — load-bearing invariants

These rules are non-negotiable across the whole codebase. They are what make
Benchwatch fast, predictable, and not "AI slop." Honor them in every feature.

1. **The protocol engine is deterministic plain code.** Step order, timers and
   action matching are handled by a plain-code state machine, never by an LLM.
   The LLM must never drive step matching, ordering, or timers.
2. **The LLM is only for language.** Use it solely to classify free speech
   (observation / correction / question / chatter), resolve spoken corrections,
   and write the final report. Nothing control-flow critical depends on it.
3. **Vision-only core.** Everything core must work from vision alone. Audio and
   speech are optional. There are NO wake words. The system must keep working if
   transcription or wifi fails.
4. **Early deviation warning.** The deviation alert fires on `bottle_lifted`
   (before the pour) and must be produced within one second.
5. **Local transcription.** Transcription runs locally with faster-whisper so it
   does not depend on venue wifi.
6. **Canned LLM fallback.** The language layer has a deterministic canned
   fallback for report generation when the Anthropic API is unavailable. Never
   let a missing API key or network crash the core flow.
7. **Event log is the single source of truth.** Every fact is an `Event`
   (timestamp, source in {vision, audio, engine, user}, type, step_id, payload)
   appended to the `SessionLog`. The UI and the report derive from this log, and
   it is saved as JSON on session end for replay.
8. **One backend, WebSockets.** All four services communicate through a single
   FastAPI backend over WebSockets.
9. **Spoken alerts use the browser.** Alerts are spoken via the browser
   `speechSynthesis` API — no extra TTS service.

## Engineering constraints

- Hardware- and network-dependent code (camera, mic, Claude API) must sit behind
  interfaces with injectable fakes so the test suite runs with no device and no
  network. `pytest` green + frontend build green is the verification signal.
- Use `opencv-contrib-python-headless` (the ArUco module is required; no display
  libs in the sandbox).
- The `.kiro/` directory MUST stay committed and MUST NOT be gitignored (hard
  hackathon disqualification rule).
- Alerts are short, spoken and rare. If Benchwatch talks too much, people turn
  it off.
