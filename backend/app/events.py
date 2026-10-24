"""Event model and session log.

The event log is the single source of truth for Benchwatch. Every observed or
derived fact (a bottle lifted, a transcript segment, a deviation, a user
correction) is appended as an :class:`Event`. The UI renders from this log and
the end-of-session report is generated from it. When a session ends the whole
log is serialized to JSON so the session can be replayed later.

All four services (vision, audio, engine and the language layer) emit events
through this common model, tagged with their ``source`` so the timeline can
distinguish machine observations from engine decisions and user corrections.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

# The four event producers described in the architecture.
Source = Literal["vision", "audio", "engine", "user"]

VALID_SOURCES = ("vision", "audio", "engine", "user")


@dataclass
class Event:
    """A single timestamped fact appended to the session log.

    Attributes:
        timestamp: Epoch seconds (float) when the event occurred.
        source: One of ``vision``, ``audio``, ``engine`` or ``user``.
        type: A short event-type string, e.g. ``bottle_lifted``,
            ``transcript_segment``, ``step_completed``, ``deviation``,
            ``timer_warning``, ``timer_overrun``, ``observation``,
            ``correction``.
        step_id: The protocol step this event relates to, if any.
        payload: Free-form, JSON-serializable detail for the event.
    """

    source: Source
    type: str
    step_id: Optional[int] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if self.source not in VALID_SOURCES:
            raise ValueError(
                f"Event.source must be one of {VALID_SOURCES!r}, got {self.source!r}"
            )
        if not isinstance(self.type, str) or not self.type:
            raise ValueError("Event.type must be a non-empty string")

    def to_dict(self) -> Dict[str, Any]:
        """Return a plain, JSON-serializable dict for this event."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Event":
        """Rebuild an :class:`Event` from a dict (e.g. loaded from JSON)."""
        return cls(
            source=data["source"],
            type=data["type"],
            step_id=data.get("step_id"),
            payload=dict(data.get("payload") or {}),
            timestamp=data.get("timestamp", time.time()),
        )


class SessionLog:
    """An append-only, replayable log of session events.

    The log keeps events in insertion order. It can be serialized to and from
    JSON so a completed session can be replayed or fed to report generation.
    """

    def __init__(
        self,
        protocol_name: Optional[str] = None,
        events: Optional[List[Event]] = None,
    ) -> None:
        self.protocol_name = protocol_name
        self.events: List[Event] = list(events) if events else []

    def append(self, event: Event) -> Event:
        """Append an :class:`Event` to the log and return it."""
        if not isinstance(event, Event):
            raise TypeError("SessionLog.append expects an Event instance")
        self.events.append(event)
        return event

    def add(
        self,
        source: Source,
        type: str,
        step_id: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        timestamp: Optional[float] = None,
    ) -> Event:
        """Construct and append an :class:`Event` in one call."""
        event = Event(
            source=source,
            type=type,
            step_id=step_id,
            payload=dict(payload or {}),
            timestamp=timestamp if timestamp is not None else time.time(),
        )
        return self.append(event)

    def by_step(self, step_id: int) -> List[Event]:
        """Return all events related to a given step id."""
        return [e for e in self.events if e.step_id == step_id]

    def by_type(self, type: str) -> List[Event]:
        """Return all events of a given type."""
        return [e for e in self.events if e.type == type]

    def __len__(self) -> int:
        return len(self.events)

    def __iter__(self):
        return iter(self.events)

    def to_dict(self) -> Dict[str, Any]:
        """Return a JSON-serializable dict representing the whole log."""
        return {
            "protocol_name": self.protocol_name,
            "events": [e.to_dict() for e in self.events],
        }

    def to_json(self, *, indent: int = 2) -> str:
        """Serialize the log to a JSON string."""
        return json.dumps(self.to_dict(), indent=indent, sort_keys=False)

    def save_json(self, path: Union[str, Path]) -> Path:
        """Write the log to ``path`` as JSON and return the path."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(self.to_json(), encoding="utf-8")
        return p

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionLog":
        """Rebuild a :class:`SessionLog` from a dict."""
        events = [Event.from_dict(e) for e in data.get("events", [])]
        return cls(protocol_name=data.get("protocol_name"), events=events)

    @classmethod
    def from_json(cls, text: str) -> "SessionLog":
        """Rebuild a :class:`SessionLog` from a JSON string."""
        return cls.from_dict(json.loads(text))

    @classmethod
    def load_json(cls, path: Union[str, Path]) -> "SessionLog":
        """Load a :class:`SessionLog` from a JSON file at ``path``."""
        text = Path(path).read_text(encoding="utf-8")
        return cls.from_json(text)
