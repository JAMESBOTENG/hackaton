# Benchwatch — Build blocks / tasks

The build is split so the riskiest piece (vision) lands first and the engine can
be built in parallel against fake events.

1. **Vision pipeline** — ArUco mat detection, rectification, and reliable
   per-zone HSV color detection, tested with real bottles under venue lighting.
   Riskiest; make it solid first.
2. **Protocol engine + unit tests** — the deterministic state machine driven by
   fake events, with pytest + Hypothesis property tests. Buildable in parallel.
3. **Frontend** — camera feed, self-ticking checklist, live timer, alert banner
   and event timeline wired to the backend over WebSockets, plus spoken alerts
   via browser speechSynthesis.
4. **Audio + LLM** — local faster-whisper transcription and Claude-based
   classification of free speech, with a canned fallback.
5. **Report generation** — end-of-session methods section + deviation report
   from the event log, exported as Markdown.
6. **Rehearsal** — run the demo end to end at least ten times, record a clean
   backup video, and freeze the code.

## Feature tracker (this plan)

- FEAT-001 — Repo scaffold + toolchain + shared data models + demo protocol +
  .kiro artifacts + README (green baseline). **This feature.**
- FEAT-002 — Deterministic protocol engine + timers + pytest/Hypothesis.
- FEAT-003 — Vision service (ArUco + HSV) behind an injectable interface.
- FEAT-004 — Audio (faster-whisper) + LLM language layer + canned fallback.
- FEAT-005 — FastAPI WebSocket server wiring all services.
- FEAT-006 — Report generation + Markdown export + frontend dashboard.
