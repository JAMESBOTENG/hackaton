"""Benchwatch backend application package.

Benchwatch is a protocol-aware lab-bench co-pilot. This package holds the
backend services that communicate through a single FastAPI/WebSocket server:

    - protocol.py : YAML protocol loader + dataclasses (foundational)
    - events.py   : Event model + SessionLog (single source of truth)
    - engine.py   : deterministic protocol state machine (later feature)
    - vision.py   : OpenCV ArUco mat detection + color detection (later feature)
    - audio.py    : local faster-whisper transcription (later feature)
    - llm.py       : Anthropic classify-speech + report, canned fallback (later)
    - report.py   : methods section + deviation report (later feature)
    - server.py   : FastAPI app wiring all services over WebSockets (later)

FEAT-001 ships the foundational pieces: events, protocol and the demo assay.
"""

__all__ = ["events", "protocol"]
