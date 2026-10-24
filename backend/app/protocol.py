"""Protocol model and YAML loader.

A protocol describes the reagents on the bench mat and the ordered steps of an
assay. It is parsed from a YAML file (see ``backend/protocols/demo_assay.yaml``)
into plain dataclasses that the deterministic engine consumes. The loader
validates the structure so malformed protocols fail fast with a clear message.

YAML format (from the spec)::

    name: Demo colorimetric assay
    reagents:
      buffer_a:   { label: "Buffer A",      cap_color: blue,   zone: 1 }
      reagent_b:  { label: "Reagent B",     cap_color: yellow, zone: 2 }
      stop:       { label: "Stop Solution", cap_color: red,    zone: 3 }
    target_zone: 4
    steps:
      - { id: 1, type: add,      reagent: buffer_a, description: "Add Buffer A to the sample" }
      - { id: 2, type: mix,      description: "Swirl to mix" }
      - { id: 3, type: add,      reagent: reagent_b, description: "Add Reagent B" }
      - { id: 4, type: incubate, duration_s: 60, warn_at_s: 50, description: "Incubate" }
      - { id: 5, type: add,      reagent: stop, description: "Add Stop Solution" }
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Union

import yaml

# The four step types the engine understands.
STEP_TYPES = ("add", "mix", "incubate", "manual")


class ProtocolError(ValueError):
    """Raised when a protocol file is malformed or fails validation."""


@dataclass(frozen=True)
class Reagent:
    """A reagent bottle with a colored cap and a home zone on the mat."""

    label: str
    cap_color: str
    zone: int


@dataclass
class Step:
    """One ordered step of a protocol.

    ``reagent`` is set for ``add`` steps. ``duration_s`` (and optional
    ``warn_at_s``) are set for ``incubate`` steps.
    """

    id: int
    type: str
    description: str
    reagent: Optional[str] = None
    duration_s: Optional[float] = None
    warn_at_s: Optional[float] = None


@dataclass
class Protocol:
    """A full protocol: reagents keyed by id, the target zone and ordered steps."""

    name: str
    reagents: Dict[str, Reagent]
    target_zone: int
    steps: List[Step] = field(default_factory=list)

    def step_by_id(self, step_id: int) -> Optional[Step]:
        """Return the step with the given id, or ``None``."""
        for step in self.steps:
            if step.id == step_id:
                return step
        return None

    def reagent_for(self, reagent_key: str) -> Optional[Reagent]:
        """Return the reagent for a key, or ``None``."""
        return self.reagents.get(reagent_key)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ProtocolError(message)


def _parse_reagents(raw: object) -> Dict[str, Reagent]:
    _require(isinstance(raw, dict), "'reagents' must be a mapping of id -> reagent")
    reagents: Dict[str, Reagent] = {}
    for key, value in raw.items():  # type: ignore[union-attr]
        _require(
            isinstance(value, dict),
            f"reagent '{key}' must be a mapping with label, cap_color, zone",
        )
        for required in ("label", "cap_color", "zone"):
            _require(
                required in value,
                f"reagent '{key}' is missing required field '{required}'",
            )
        _require(
            isinstance(value["zone"], int),
            f"reagent '{key}' field 'zone' must be an integer",
        )
        reagents[str(key)] = Reagent(
            label=str(value["label"]),
            cap_color=str(value["cap_color"]),
            zone=int(value["zone"]),
        )
    return reagents


def _parse_steps(raw: object, reagents: Dict[str, Reagent]) -> List[Step]:
    _require(isinstance(raw, list) and len(raw) > 0, "'steps' must be a non-empty list")
    steps: List[Step] = []
    seen_ids = set()
    for index, item in enumerate(raw):  # type: ignore[arg-type]
        _require(isinstance(item, dict), f"step #{index + 1} must be a mapping")
        for required in ("id", "type", "description"):
            _require(
                required in item,
                f"step #{index + 1} is missing required field '{required}'",
            )
        step_id = item["id"]
        _require(isinstance(step_id, int), f"step #{index + 1} 'id' must be an integer")
        _require(step_id not in seen_ids, f"duplicate step id {step_id}")
        seen_ids.add(step_id)

        step_type = str(item["type"])
        _require(
            step_type in STEP_TYPES,
            f"step {step_id} has unknown type '{step_type}' "
            f"(expected one of {STEP_TYPES})",
        )

        reagent = item.get("reagent")
        duration_s = item.get("duration_s")
        warn_at_s = item.get("warn_at_s")

        if step_type == "add":
            _require(
                reagent is not None,
                f"add step {step_id} must reference a 'reagent'",
            )
            _require(
                str(reagent) in reagents,
                f"add step {step_id} references unknown reagent '{reagent}'",
            )
        if step_type == "incubate":
            _require(
                duration_s is not None,
                f"incubate step {step_id} must define 'duration_s'",
            )
            _require(
                isinstance(duration_s, (int, float)) and duration_s > 0,
                f"incubate step {step_id} 'duration_s' must be a positive number",
            )
            if warn_at_s is not None:
                _require(
                    isinstance(warn_at_s, (int, float)) and warn_at_s >= 0,
                    f"incubate step {step_id} 'warn_at_s' must be a non-negative number",
                )

        steps.append(
            Step(
                id=int(step_id),
                type=step_type,
                description=str(item["description"]),
                reagent=str(reagent) if reagent is not None else None,
                duration_s=float(duration_s) if duration_s is not None else None,
                warn_at_s=float(warn_at_s) if warn_at_s is not None else None,
            )
        )
    return steps


def parse_protocol(data: object) -> Protocol:
    """Validate an already-parsed mapping and build a :class:`Protocol`."""
    _require(isinstance(data, dict), "protocol root must be a mapping")
    for required in ("name", "reagents", "target_zone", "steps"):
        _require(required in data, f"protocol is missing required field '{required}'")

    reagents = _parse_reagents(data["reagents"])

    target_zone = data["target_zone"]
    _require(isinstance(target_zone, int), "'target_zone' must be an integer")

    # The target zone must be distinct from every reagent home zone.
    home_zones = {r.zone for r in reagents.values()}
    _require(
        target_zone not in home_zones,
        f"'target_zone' {target_zone} collides with a reagent home zone",
    )

    steps = _parse_steps(data["steps"], reagents)

    return Protocol(
        name=str(data["name"]),
        reagents=reagents,
        target_zone=int(target_zone),
        steps=steps,
    )


def load_protocol(path: Union[str, Path]) -> Protocol:
    """Load and validate a protocol from a YAML file.

    Raises:
        ProtocolError: if the file is missing, not valid YAML, or malformed.
    """
    p = Path(path)
    if not p.is_file():
        raise ProtocolError(f"protocol file not found: {p}")
    try:
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:  # pragma: no cover - passthrough wrapping
        raise ProtocolError(f"invalid YAML in protocol file {p}: {exc}") from exc
    return parse_protocol(data)
