"""Builder for the checked-in demo session-log fixture.

Run with: backend/.venv/bin/python -m app.fixtures._build_demo_session

This produces ``demo_session.json`` representing the scripted live-demo run:

* step 1: Buffer A added;
* step 2: mix completed;
* step 3: the red Stop Solution is lifted by mistake -> an early deviation
  naming the stop solution and step 3; the scientist remarks "the yellow looks
  a little paler than last time" (an observation on step 3); Reagent B is then
  actually added (step 3 completes);
* step 4: incubation, with a timer warning at 50 s and a timer overrun flagged
  when the next action occurs past the 60 s duration;
* step 5: the Stop Solution is added.

The fixture is produced by driving the REAL deterministic engine with fake
vision/audio events (no hardware), so it is guaranteed to be internally
consistent with the Event/SessionLog schema and loads via SessionLog.load_json.
"""

from __future__ import annotations

from pathlib import Path

from app.engine import ProtocolEngine
from app.events import Event, SessionLog
from app.protocol import load_protocol

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
PROTOCOL_PATH = BACKEND_DIR / "protocols" / "demo_assay.yaml"
OUT_PATH = Path(__file__).resolve().parent / "demo_session.json"

# A fixed base epoch so the ISO timestamps in the report are stable.
BASE = 1_700_000_000.0


def _vision(log: SessionLog, engine: ProtocolEngine, etype: str, bottle: str, t: float) -> None:
    event = Event(
        source="vision",
        type=etype,
        payload={"bottle": bottle},
        timestamp=t,
    )
    log.append(event)
    engine.handle_event(event)


def build() -> SessionLog:
    protocol = load_protocol(PROTOCOL_PATH)
    log = SessionLog(protocol_name=protocol.name)
    engine = ProtocolEngine(protocol, log=log)

    # Step 1: Buffer A added.
    _vision(log, engine, "bottle_lifted", "buffer_a", BASE + 2.0)
    _vision(log, engine, "bottle_over_target", "buffer_a", BASE + 4.0)
    _vision(log, engine, "bottle_returned", "buffer_a", BASE + 5.0)

    # Step 2: mix (spoken/typed completion).
    done = Event(source="audio", type="step_done", step_id=2, payload={}, timestamp=BASE + 8.0)
    log.append(done)
    engine.handle_event(done)

    # Step 3: the red Stop Solution is lifted by mistake -> early deviation.
    _vision(log, engine, "bottle_lifted", "stop", BASE + 11.0)
    _vision(log, engine, "bottle_returned", "stop", BASE + 12.0)

    # The scientist remarks on the color -> observation attached to step 3.
    obs = Event(
        source="audio",
        type="observation",
        step_id=3,
        payload={"text": "the yellow looks a little paler than last time"},
        timestamp=BASE + 13.0,
    )
    log.append(obs)

    # Reagent B is then actually added (step 3 completes correctly).
    _vision(log, engine, "bottle_lifted", "reagent_b", BASE + 15.0)
    _vision(log, engine, "bottle_over_target", "reagent_b", BASE + 17.0)
    _vision(log, engine, "bottle_returned", "reagent_b", BASE + 18.0)

    # Step 4: incubation. Tick at 50 s -> warning. The next action (lifting the
    # stop solution for step 5) occurs past the 60 s duration -> overrun.
    incubate_start = BASE + 18.0  # step 3 completed around here; timer started
    engine.tick(now=incubate_start + 50.0)  # warning at 50 s

    # Step 5: the Stop Solution is added, 65 s into the incubation (overrun).
    _vision(log, engine, "bottle_lifted", "stop", incubate_start + 65.0)
    _vision(log, engine, "bottle_over_target", "stop", incubate_start + 67.0)
    _vision(log, engine, "bottle_returned", "stop", incubate_start + 68.0)

    return log


def main() -> None:
    log = build()
    log.save_json(OUT_PATH)
    print(f"wrote {OUT_PATH} with {len(log.events)} events")


if __name__ == "__main__":
    main()
