"""Tests for the optional audio pipeline (app.audio).

No microphone and no real whisper model: the mic source reports unavailable in
the sandbox, and the Transcriber's model load is stubbed so no download happens.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from app.audio import (
    EV_TRANSCRIPT,
    ArrayAudioSource,
    AudioService,
    MicAudioSource,
    Transcriber,
    build_initial_prompt,
)
from app.protocol import load_protocol

PROTOCOL_PATH = (
    Path(__file__).resolve().parent.parent / "protocols" / "demo_assay.yaml"
)


@pytest.fixture()
def protocol():
    return load_protocol(PROTOCOL_PATH)


# --------------------------------------------------------------------------- #
# Import / construct with no device and no model (lazy load).
# --------------------------------------------------------------------------- #
def test_mic_source_constructs_without_device():
    # Constructing the mic source must not open a device or import sounddevice.
    source = MicAudioSource()
    assert source.sample_rate > 0
    # In the headless sandbox the device/stream is simply never opened.
    assert source.read() is None


def test_transcriber_is_lazy_and_guarded(protocol):
    # Constructing a Transcriber must not load/download a model. A load failure
    # (no model present) must not raise; transcribe just returns ''.
    t = Transcriber(protocol)
    assert t._model is None  # not loaded on construction

    def _boom():
        raise RuntimeError("no model available offline")

    t2 = Transcriber(protocol, model_factory=_boom)
    assert t2.transcribe(np.zeros(16000, dtype=np.float32)) == ""
    assert t2.available() is False


def test_initial_prompt_seeded_with_reagent_vocabulary(protocol):
    prompt = build_initial_prompt(protocol)
    assert "Buffer A" in prompt
    assert "Reagent B" in prompt
    assert "Stop Solution" in prompt


# --------------------------------------------------------------------------- #
# Transcription via a stubbed model (no real whisper).
# --------------------------------------------------------------------------- #
class _StubSegment:
    def __init__(self, text):
        self.text = text


class _StubModel:
    """Stand-in for faster_whisper.WhisperModel: returns canned segments."""

    def __init__(self, text="the yellow looks a little paler than last time"):
        self.text = text
        self.calls = []

    def transcribe(self, audio, **kwargs):
        self.calls.append(kwargs)
        return [_StubSegment(self.text)], {"language": "en"}


def test_transcriber_uses_initial_prompt_and_returns_text(protocol):
    model = _StubModel("Buffer A looks cloudy")
    t = Transcriber(protocol, model_factory=lambda: model)
    out = t.transcribe(np.ones(16000, dtype=np.float32))
    assert out == "Buffer A looks cloudy"
    # The seeded initial_prompt (reagent vocab) was passed to the model.
    assert model.calls and model.calls[0].get("initial_prompt")
    assert "Buffer A" in model.calls[0]["initial_prompt"]


def test_array_source_feeds_transcriber_via_service(protocol):
    model = _StubModel("the yellow looks a little paler than last time")
    transcriber = Transcriber(protocol, model_factory=lambda: model)
    source = ArrayAudioSource(
        [np.ones(16000, dtype=np.float32)], sample_rate=16000
    )
    emitted = []
    service = AudioService(
        protocol, source, transcriber, on_event=emitted.append, clock=lambda: 42.0
    )
    assert service.enabled() is True

    events = service.drain()
    assert len(events) == 1
    ev = events[0]
    assert ev.source == "audio"
    assert ev.type == EV_TRANSCRIPT
    assert ev.payload["text"] == "the yellow looks a little paler than last time"
    assert ev.payload["start"] == 0.0
    assert ev.payload["end"] == pytest.approx(1.0)
    assert emitted == events


def test_service_disabled_without_model(protocol):
    # A transcriber whose model never loads -> service stays disabled, no crash.
    def _boom():
        raise RuntimeError("offline")

    transcriber = Transcriber(protocol, model_factory=_boom)
    source = ArrayAudioSource([np.ones(16000, dtype=np.float32)])
    service = AudioService(protocol, source, transcriber)
    service.start()  # must not raise even though the model cannot load
    # Draining yields nothing because the model fails to load and transcription
    # returns '' for every chunk (the vision-only core is unaffected).
    assert service.drain() == []
    # After a failed load attempt the transcriber (and thus the service) is
    # known to be unavailable.
    assert transcriber.available() is False
    assert service.enabled() is False


def test_empty_chunk_produces_no_event(protocol):
    model = _StubModel("ignored")
    transcriber = Transcriber(protocol, model_factory=lambda: model)
    source = ArrayAudioSource([np.array([], dtype=np.float32)])
    service = AudioService(protocol, source, transcriber)
    assert service.run_once() is None
