"""Deterministic protocol state machine.

This is the heart of Benchwatch and a load-bearing invariant: step order,
action matching and all timers are handled here by **plain code**, never by an
LLM. The language layer (``app.llm``) is deliberately not imported. Keeping the
engine deterministic is what makes alerts predictable and fast (the early
deviation warning must fire within one second of a bottle being lifted).

The engine consumes :class:`~app.events.Event` objects from the vision service
(``bottle_lifted``, ``bottle_over_target``, ``bottle_returned``) and
audio/user-derived signals (a spoken ``mixed`` completion, a ``correction``),
decides for each one whether it *matches* the currently due step, is a
*deviation*, or should be *ignored*, and emits its own engine events into the
session log:

* ``step_completed`` - the due step was performed; the engine advances.
* ``deviation`` - a bottle other than the expected one was lifted. Emitted on
  the ``bottle_lifted`` event (before the pour), naming the lifted bottle and
  the step that is actually due.
* ``timer_warning`` - an incubation reached its configured warning time.
* ``timer_overrun`` - the action after an incubation happened past its duration.

Time is injected as a ``clock`` callable so tests can advance it explicitly
without real sleeps. The engine never calls :func:`time.sleep` and only reads
wall-clock time through the injected clock.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional

from .events import Event
from .protocol import Protocol, Step

# Types the engine reacts to.
VISION_LIFTED = "bottle_lifted"
VISION_OVER_TARGET = "bottle_over_target"
VISION_RETURNED = "bottle_returned"

# A spoken/typed completion remark for a non-vision step ("mixed", "done").
SIGNAL_STEP_DONE = "step_done"
# A spoken/typed correction, reassigning a previously recorded event.
SIGNAL_CORRECTION = "correction"

# Emitted engine event types.
EV_STEP_COMPLETED = "step_completed"
EV_DEVIATION = "deviation"
EV_TIMER_WARNING = "timer_warning"
EV_TIMER_OVERRUN = "timer_overrun"
EV_SESSION_COMPLETE = "session_complete"
EV_CORRECTION_APPLIED = "correction_applied"
EV_STEP_SKIPPED = "step_skipped"

EmitFn = Callable[[Event], Event]


def _bottle_of(event: Event) -> Optional[str]:
    """Extract the bottle/reagent key carried by a vision event."""
    payload = event.payload or {}
    for key in ("bottle", "reagent", "bottle_id"):
        if payload.get(key):
            return str(payload[key])
    return None


class ProtocolEngine:
    """A deterministic state machine that tracks a run of a protocol.

    Args:
        protocol: The loaded :class:`~app.protocol.Protocol` to track.
        log: Something with an ``append(Event)`` method (typically a
            :class:`~app.events.SessionLog`). Mutually exclusive with ``emit``.
        emit: Optional callback invoked with every engine-produced event
            instead of (or in addition to) appending to ``log``.
        clock: A zero-argument callable returning epoch seconds. Injected so
            tests advance time deterministically. Defaults to ``time.time``.
    """

    def __init__(
        self,
        protocol: Protocol,
        log: Any = None,
        *,
        emit: Optional[EmitFn] = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if log is None and emit is None:
            raise ValueError("ProtocolEngine requires a log or an emit callback")
        self.protocol = protocol
        self.log = log
        self._emit = emit
        self.clock = clock

        self.current_step_index: int = 0
        self.finished: bool = False

        # Deviations seen for the currently due step, so an ignored-then-poured
        # wrong reagent is recorded exactly once.
        self._pending_lift: Optional[str] = None

        # Active incubation timer state (None when no timer is running).
        self._timer: Optional[Dict[str, Any]] = None

        # step id -> reagent key actually used to complete it (for corrections).
        self.completed: Dict[int, Optional[str]] = {}

    # -- introspection ----------------------------------------------------

    @property
    def steps(self) -> List[Step]:
        return self.protocol.steps

    @property
    def current_step(self) -> Optional[Step]:
        """The step currently due, or ``None`` when the protocol is finished."""
        if 0 <= self.current_step_index < len(self.steps):
            return self.steps[self.current_step_index]
        return None

    def _reagent_key_for_step(self, step: Optional[Step]) -> Optional[str]:
        return step.reagent if step is not None else None

    def _label_for(self, reagent_key: Optional[str]) -> str:
        if reagent_key is None:
            return "unknown bottle"
        reagent = self.protocol.reagent_for(reagent_key)
        return reagent.label if reagent is not None else reagent_key

    # -- emission ---------------------------------------------------------

    def _now(self, event: Optional[Event] = None) -> float:
        if event is not None and event.timestamp is not None:
            return float(event.timestamp)
        return float(self.clock())

    def _emit_event(
        self,
        type: str,
        step_id: Optional[int],
        payload: Dict[str, Any],
        timestamp: float,
    ) -> Event:
        event = Event(
            source="engine",
            type=type,
            step_id=step_id,
            payload=payload,
            timestamp=timestamp,
        )
        if self.log is not None:
            self.log.append(event)
        if self._emit is not None:
            self._emit(event)
        return event

    # -- public API -------------------------------------------------------

    def handle_event(self, event: Event) -> List[Event]:
        """Feed an incoming event and return the engine events it produced.

        The returned list is also appended to the log / passed to ``emit``.
        """
        if self.finished:
            return []

        if event.source == "vision":
            if event.type == VISION_LIFTED:
                return self._on_lifted(event)
            if event.type == VISION_OVER_TARGET:
                return self._on_over_target(event)
            if event.type == VISION_RETURNED:
                return self._on_returned(event)
            return []

        if event.type == SIGNAL_STEP_DONE:
            return self._on_step_done(event)
        if event.type == SIGNAL_CORRECTION:
            return self.apply_correction(
                step_id=event.step_id,
                reagent_key=(event.payload or {}).get("reagent"),
                timestamp=event.timestamp,
            )
        return []

    def tick(self, now: Optional[float] = None) -> List[Event]:
        """Advance the clock-driven timers. Returns any engine events produced.

        ``now`` defaults to the injected clock. Call this on a cadence (tests
        call it explicitly with advancing timestamps).
        """
        if now is None:
            now = float(self.clock())
        produced: List[Event] = []
        if self._timer is not None:
            produced.extend(self._check_timer(now))
        return produced

    # -- vision handling --------------------------------------------------

    def _advance_non_action_steps(self, upto_reagent: str, now: float) -> List[Event]:
        """Auto-complete intervening mix/manual/incubate steps before an add.

        When a bottle for a *later* add step is lifted, mix/manual steps (not
        vision-detectable) and a preceding incubate step (whose end is marked
        by the next action) between the current position and that add step are
        auto-advanced rather than treated as deviations.
        """
        produced: List[Event] = []
        while True:
            step = self.current_step
            if step is None:
                break
            if step.type in ("mix", "manual"):
                produced.extend(self._complete_step(step, reagent_key=None, now=now))
                continue
            if step.type == "incubate":
                # The lift is the next action that ends the incubation.
                produced.extend(self._complete_step(step, reagent_key=None, now=now))
                continue
            if step.type == "add" and step.reagent == upto_reagent:
                break
            # An add step that doesn't match the lifted bottle: stop; the
            # caller decides whether this is a match or a deviation.
            break
        return produced

    def _on_lifted(self, event: Event) -> List[Event]:
        bottle = _bottle_of(event)
        now = self._now(event)
        produced: List[Event] = []

        # An incubation ends when the next action begins: if the bottle for a
        # later add step is lifted while an incubate is due, complete the
        # incubate (resolving overrun) before matching the lift.
        if bottle is not None:
            later_add = self._next_add_index_for(bottle)
            if (
                later_add is not None
                and later_add > self.current_step_index
                and self._only_non_action_between(self.current_step_index, later_add)
            ):
                produced.extend(self._advance_non_action_steps(bottle, now))

        step = self.current_step
        if step is None:
            return produced

        if step.type != "add":
            # No add step is due; nothing to match a lift against yet.
            return produced

        expected = step.reagent
        if bottle == expected:
            # Correct bottle lifted; remember it and wait for over_target.
            self._pending_lift = bottle
            return produced

        # A non-expected bottle was lifted: early deviation, emitted now.
        produced.append(
            self._emit_event(
                EV_DEVIATION,
                step_id=step.id,
                payload={
                    "lifted": bottle,
                    "lifted_label": self._label_for(bottle),
                    "expected": expected,
                    "expected_label": self._label_for(expected),
                    "due_step_id": step.id,
                    "due_step_description": step.description,
                    "message": self._deviation_message(bottle, step),
                },
                timestamp=now,
            )
        )
        # Record that this wrong bottle is currently lifted, so if it is poured
        # anyway (over_target) we continue tracking from the step performed.
        self._pending_lift = bottle
        return produced

    def _on_over_target(self, event: Event) -> List[Event]:
        bottle = _bottle_of(event)
        now = self._now(event)
        step = self.current_step
        if step is None or step.type != "add":
            return []

        expected = step.reagent
        if bottle == expected:
            return self._complete_step(step, reagent_key=bottle, now=now)

        # A wrong reagent was poured despite the deviation warning. Record it
        # and continue tracking from the step the scientist actually performed:
        # if the poured bottle is the reagent of a *later* add step, advance to
        # and complete that step (skipping the steps in between). Otherwise mark
        # the current step complete-with-deviation and advance.
        produced: List[Event] = []
        later_idx = self._next_add_index_for(bottle) if bottle is not None else None
        if later_idx is not None and later_idx > self.current_step_index:
            # Auto-advance intervening non-action steps, then complete the later
            # add step as a wrong-order pour.
            while self.current_step_index < later_idx:
                cur = self.current_step
                if cur is None:
                    break
                if cur.type in ("mix", "manual"):
                    produced.extend(self._complete_step(cur, reagent_key=None, now=now))
                else:
                    # Skip an add/incubate step that was jumped over.
                    produced.extend(
                        self._skip_step(cur, now=now, reason="wrong_order_pour")
                    )
            target = self.current_step
            if target is not None:
                produced.extend(
                    self._complete_step(
                        target, reagent_key=bottle, now=now, deviation=True
                    )
                )
            return produced

        produced.extend(
            self._complete_step(step, reagent_key=bottle, now=now, deviation=True)
        )
        return produced

    def _on_returned(self, event: Event) -> List[Event]:
        # Returning a bottle clears the pending-lift tracking. No step change.
        self._pending_lift = None
        return []

    def _on_step_done(self, event: Event) -> List[Event]:
        """A spoken/typed completion ('mixed', 'done') for a mix/manual step."""
        now = self._now(event)
        step = self.current_step
        if step is None:
            return []
        if step.type in ("mix", "manual"):
            return self._complete_step(step, reagent_key=None, now=now)
        return []

    # -- step transitions -------------------------------------------------

    def _complete_step(
        self,
        step: Step,
        *,
        reagent_key: Optional[str],
        now: float,
        deviation: bool = False,
    ) -> List[Event]:
        produced: List[Event] = []
        self.completed[step.id] = reagent_key
        self._pending_lift = None

        payload: Dict[str, Any] = {
            "step_id": step.id,
            "step_type": step.type,
            "description": step.description,
            "reagent": reagent_key,
        }
        if deviation:
            payload["deviation"] = True
            payload["expected_reagent"] = step.reagent

        produced.append(
            self._emit_event(
                EV_STEP_COMPLETED,
                step_id=step.id,
                payload=payload,
                timestamp=now,
            )
        )

        # If this action occurred while a timer was running, it is the "next
        # action" after an incubation: evaluate overrun then clear the timer.
        if self._timer is not None:
            produced.extend(self._resolve_timer_on_action(now))

        self.current_step_index += 1

        # Starting an incubation: the step just completed precedes an incubate.
        produced.extend(self._maybe_start_timer(now))

        produced.extend(self._maybe_finish(now))
        return produced

    def _skip_step(self, step: Step, *, now: float, reason: str) -> List[Event]:
        """Advance past a step that was skipped (jumped over by a wrong pour).

        Emits a ``step_skipped`` engine event so the log is fully
        self-describing: the report can show which add/incubate steps were
        jumped over (and why) rather than silently omitting them. This is plain
        deterministic code; no language layer is involved.
        """
        produced: List[Event] = [
            self._emit_event(
                EV_STEP_SKIPPED,
                step_id=step.id,
                payload={
                    "step_id": step.id,
                    "step_type": step.type,
                    "description": step.description,
                    "reagent": step.reagent,
                    "reason": reason,
                },
                timestamp=now,
            )
        ]
        self.current_step_index += 1
        # A skipped incubate should not leave a dangling timer.
        return produced

    def _maybe_start_timer(self, now: float) -> List[Event]:
        step = self.current_step
        if step is not None and step.type == "incubate" and self._timer is None:
            self._timer = {
                "step_id": step.id,
                "start": now,
                "duration_s": float(step.duration_s or 0.0),
                "warn_at_s": (
                    float(step.warn_at_s)
                    if step.warn_at_s is not None
                    else None
                ),
                "warned": False,
            }
        return []

    def _check_timer(self, now: float) -> List[Event]:
        """Fire a one-shot warning when the warn threshold is crossed."""
        produced: List[Event] = []
        timer = self._timer
        if timer is None:
            return produced
        elapsed = now - timer["start"]
        if (
            not timer["warned"]
            and timer["warn_at_s"] is not None
            and elapsed >= timer["warn_at_s"]
        ):
            timer["warned"] = True
            produced.append(
                self._emit_event(
                    EV_TIMER_WARNING,
                    step_id=timer["step_id"],
                    payload={
                        "step_id": timer["step_id"],
                        "elapsed_s": round(elapsed, 3),
                        "warn_at_s": timer["warn_at_s"],
                        "duration_s": timer["duration_s"],
                        "message": (
                            f"Incubation reached {int(timer['warn_at_s'])}s "
                            f"of {int(timer['duration_s'])}s."
                        ),
                    },
                    timestamp=now,
                )
            )
        return produced

    def _resolve_timer_on_action(self, now: float) -> List[Event]:
        """When the next action happens, flag an overrun if past duration."""
        produced: List[Event] = []
        timer = self._timer
        if timer is None:
            return produced
        elapsed = now - timer["start"]
        if elapsed > timer["duration_s"]:
            produced.append(
                self._emit_event(
                    EV_TIMER_OVERRUN,
                    step_id=timer["step_id"],
                    payload={
                        "step_id": timer["step_id"],
                        "elapsed_s": round(elapsed, 3),
                        "duration_s": timer["duration_s"],
                        "overrun_s": round(elapsed - timer["duration_s"], 3),
                        "message": (
                            f"Incubation overran by "
                            f"{round(elapsed - timer['duration_s'], 1)}s."
                        ),
                    },
                    timestamp=now,
                )
            )
        self._timer = None
        return produced

    def _maybe_finish(self, now: float) -> List[Event]:
        if self.current_step_index >= len(self.steps) and not self.finished:
            self.finished = True
            # Resolve any still-running timer (e.g. protocol ended on an
            # incubate) without an overrun action.
            self._timer = None
            return [
                self._emit_event(
                    EV_SESSION_COMPLETE,
                    step_id=None,
                    payload={"completed_steps": sorted(self.completed)},
                    timestamp=now,
                )
            ]
        return []

    # -- helpers ----------------------------------------------------------

    def _next_add_index_for(self, reagent_key: str) -> Optional[int]:
        """Index of the next (at or after current) add step using a reagent."""
        for idx in range(self.current_step_index, len(self.steps)):
            step = self.steps[idx]
            if step.type == "add" and step.reagent == reagent_key:
                return idx
        return None

    def _only_non_action_between(self, start_idx: int, end_idx: int) -> bool:
        """True if every step in [start_idx, end_idx) is auto-advanceable.

        Auto-advanceable means a mix/manual step (not vision-detectable) or an
        incubate step (ended by the next action). Add steps are *not*
        auto-advanceable: an add step between here and the lifted bottle means
        the lift is for a later step out of order, handled elsewhere.
        """
        for idx in range(start_idx, end_idx):
            if self.steps[idx].type not in ("mix", "manual", "incubate"):
                return False
        return True

    def _deviation_message(self, bottle: Optional[str], step: Step) -> str:
        lifted = self._label_for(bottle)
        due = self._label_for(step.reagent)
        return (
            f"That's the {lifted}, you're on step {step.id}, {due}."
        )

    # -- corrections ------------------------------------------------------

    def apply_correction(
        self,
        *,
        step_id: Optional[int],
        reagent_key: Optional[str],
        timestamp: Optional[float] = None,
    ) -> List[Event]:
        """Deterministically reassign the reagent recorded for a step.

        This is the plain-code primitive the LLM correction layer (FEAT-005)
        calls once it has parsed a spoken correction into a (step, reagent)
        pair. It updates the engine's view of what completed a step and records
        a ``correction_applied`` event; it does not itself interpret language.
        """
        now = float(timestamp) if timestamp is not None else float(self.clock())
        if step_id is None or step_id not in self.completed:
            return []
        previous = self.completed.get(step_id)
        self.completed[step_id] = reagent_key
        return [
            self._emit_event(
                EV_CORRECTION_APPLIED,
                step_id=step_id,
                payload={
                    "step_id": step_id,
                    "previous_reagent": previous,
                    "reagent": reagent_key,
                },
                timestamp=now,
            )
        ]
