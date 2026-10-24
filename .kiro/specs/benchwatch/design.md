# Benchwatch — Design

## Architecture

The system has four services that communicate through a single FastAPI backend
over WebSockets. Everything core must work from vision alone; audio and the LLM
are optional enhancements that degrade gracefully.

```
   camera ─▶ vision service ─┐
                             │  events (bottle_lifted / bottle_over_target / bottle_returned)
   mic ───▶ audio service ──┼──▶  PROTOCOL ENGINE (deterministic state machine)
                             │        │ owns all timers
                             │        │ emits step_completed / deviation /
                             │        │        timer_warning / timer_overrun
   LLM (Anthropic) ◀────────┘        ▼
   classify speech / write report   SESSION LOG (JSON, single source of truth)
                                        │
                                        ▼
                             FastAPI + WebSocket  ◀──▶  React dashboard
                                                        (feed + overlays, checklist,
                                                         timer, alert banner, timeline,
                                                         speechSynthesis alerts)
```

### Vision service (`app/vision.py`)

Reads frames at ~15 fps. Uses ArUco corner markers to warp the mat to a
top-down view, then checks each home zone for its expected cap color via HSV
thresholds. A bottle is "lifted" when its color disappears from its home zone
for more than half a second, and "added" when its color appears over the target
zone. MediaPipe Hands can optionally confirm a hand is involved to cut false
positives. The device sits behind an interface so tests inject fakes.

### Audio service (`app/audio.py`)

Captures mic audio and transcribes it locally in short chunks with
faster-whisper (base.en/small.en). The initial prompt is seeded with the
protocol vocabulary so reagent names transcribe correctly. Local transcription
avoids depending on venue wifi. Emits transcript segments with timestamps.

### Protocol engine (`app/engine.py`)

A deterministic plain-code state machine loaded from a protocol file. It
consumes vision/audio events and decides whether each matches the expected
step, is a deviation, or should be ignored. It owns all timers. Early warning
on `bottle_lifted` is what lets Benchwatch catch a mistake before the pour.

### Language layer (`app/llm.py`)

Sends transcript segments plus the current step and recent events to the Claude
API. Classifies each segment as observation / correction / question / chatter
and returns structured JSON. At session end it writes the methods section and
deviation report. A deterministic canned fallback is used when wifi or the API
is unavailable.

## Load-bearing invariants

1. The protocol engine is a DETERMINISTIC plain-code state machine. The LLM
   NEVER drives step matching, ordering, or timers.
2. The LLM is used ONLY for natural-language tasks: classifying free speech,
   resolving spoken corrections, and writing the report.
3. Everything core must work from vision alone; audio/speech is optional, there
   are no wake words, and the system keeps working if transcription or wifi
   fails.
4. The early deviation warning fires on `bottle_lifted` (before the pour) within
   one second.
5. The event log (timestamp, source, type, step_id, payload) is the single
   source of truth for UI and report, saved as JSON on session end for replay.
6. All four services communicate through one backend over WebSockets.
7. Spoken alerts use the browser speechSynthesis API (no extra TTS service).

## Data models (FEAT-001)

- `app/events.py` — `Event` (timestamp, source, type, step_id, payload) and
  `SessionLog` with `save_json` / `load_json` for replayable sessions.
- `app/protocol.py` — `Reagent`, `Step`, `Protocol` dataclasses plus
  `load_protocol(path)` which validates the YAML and raises `ProtocolError` on
  malformed input.
