"""Tests for the YAML protocol loader and the shipped demo protocol."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.protocol import (
    Protocol,
    ProtocolError,
    Step,
    load_protocol,
    parse_protocol,
)

DEMO_PATH = Path(__file__).resolve().parents[1] / "protocols" / "demo_assay.yaml"


@pytest.fixture()
def demo() -> Protocol:
    return load_protocol(DEMO_PATH)


def test_demo_protocol_exists() -> None:
    assert DEMO_PATH.is_file(), f"demo protocol missing at {DEMO_PATH}"


def test_demo_top_level_structure(demo: Protocol) -> None:
    assert demo.name == "Demo colorimetric assay"
    assert demo.target_zone == 4
    assert len(demo.reagents) == 3
    assert len(demo.steps) == 5


def test_demo_reagents(demo: Protocol) -> None:
    assert set(demo.reagents) == {"buffer_a", "reagent_b", "stop"}

    buffer_a = demo.reagents["buffer_a"]
    assert buffer_a.label == "Buffer A"
    assert buffer_a.cap_color == "blue"
    assert buffer_a.zone == 1

    reagent_b = demo.reagents["reagent_b"]
    assert reagent_b.label == "Reagent B"
    assert reagent_b.cap_color == "yellow"
    assert reagent_b.zone == 2

    stop = demo.reagents["stop"]
    assert stop.label == "Stop Solution"
    assert stop.cap_color == "red"
    assert stop.zone == 3


def test_demo_steps_sequence(demo: Protocol) -> None:
    ids = [s.id for s in demo.steps]
    assert ids == [1, 2, 3, 4, 5]

    types = [s.type for s in demo.steps]
    assert types == ["add", "mix", "add", "incubate", "add"]


def test_demo_add_steps_reference_reagents(demo: Protocol) -> None:
    step1 = demo.step_by_id(1)
    assert step1 is not None
    assert step1.type == "add"
    assert step1.reagent == "buffer_a"
    assert step1.description == "Add Buffer A to the sample"

    step3 = demo.step_by_id(3)
    assert step3 is not None
    assert step3.type == "add"
    assert step3.reagent == "reagent_b"
    assert step3.description == "Add Reagent B"

    step5 = demo.step_by_id(5)
    assert step5 is not None
    assert step5.reagent == "stop"


def test_demo_incubate_step(demo: Protocol) -> None:
    step4 = demo.step_by_id(4)
    assert step4 is not None
    assert step4.type == "incubate"
    assert step4.duration_s == 60
    assert step4.warn_at_s == 50
    assert step4.description == "Incubate"


def test_demo_mix_step_has_no_reagent(demo: Protocol) -> None:
    step2 = demo.step_by_id(2)
    assert step2 is not None
    assert step2.type == "mix"
    assert step2.reagent is None
    assert step2.description == "Swirl to mix"


def test_malformed_add_step_unknown_reagent_raises() -> None:
    bad = {
        "name": "Bad",
        "reagents": {"a": {"label": "A", "cap_color": "blue", "zone": 1}},
        "target_zone": 4,
        "steps": [
            {"id": 1, "type": "add", "reagent": "does_not_exist", "description": "x"}
        ],
    }
    with pytest.raises(ProtocolError):
        parse_protocol(bad)


def test_malformed_incubate_without_duration_raises() -> None:
    bad = {
        "name": "Bad",
        "reagents": {"a": {"label": "A", "cap_color": "blue", "zone": 1}},
        "target_zone": 4,
        "steps": [{"id": 1, "type": "incubate", "description": "no duration"}],
    }
    with pytest.raises(ProtocolError):
        parse_protocol(bad)


def test_malformed_unknown_step_type_raises() -> None:
    bad = {
        "name": "Bad",
        "reagents": {"a": {"label": "A", "cap_color": "blue", "zone": 1}},
        "target_zone": 4,
        "steps": [{"id": 1, "type": "teleport", "description": "nope"}],
    }
    with pytest.raises(ProtocolError):
        parse_protocol(bad)


def test_missing_file_raises() -> None:
    with pytest.raises(ProtocolError):
        load_protocol(DEMO_PATH.parent / "no_such_protocol.yaml")


def test_target_zone_collision_raises() -> None:
    bad = {
        "name": "Bad",
        "reagents": {"a": {"label": "A", "cap_color": "blue", "zone": 4}},
        "target_zone": 4,
        "steps": [{"id": 1, "type": "add", "reagent": "a", "description": "x"}],
    }
    with pytest.raises(ProtocolError):
        parse_protocol(bad)
