"""Audio service: optional local transcription for Benchwatch.

Audio is strictly OPTIONAL. The vision-only core works with no microphone and
no transcription model; this module only adds spoken observations and verbal
corrections on top. There are NO wake words: the scientist never has to address
the system. If the microphone, the whisper model or the venue wifi are missing,
the audio service simply stays disabled and nothing else is affected.

Transcription runs LOCALLY with faster-whisper (the ``base.en`` or ``small.en``
English model is enough) so it never depends on venue wifi. The model is loaded
lazily and guarded: importing this module downloads nothing and needs no device,
and constructing the service with no mic/model leaves it disabled rather than
crashing.

The pipeline is:

1. An :class:`AudioSource` yields raw mono float32 audio chunks (a real
   :class:`MicAudioSource` backed by ``sounddevice``, or an
   :class:`ArrayAudioSource` of fixture samples for tests).
2. A :class:`Transcriber` wraps faster-whisper. Its ``initial_prompt`` is seeded
   with the protocol's reagent vocabulary (labels like ``Buffer A``,
   ``Reagent B``, ``Stop Solution``) so reagent names transcribe correctly.
3. An :class:`AudioService` chunks capture, transcribes each chunk locally and
   emits ``Event(source="audio", type="transcript", payload={text, start, end})``
   to its callback. The backend classifies those transcripts via the language
   layer (``app.llm``) and attaches observations / applies corrections.

Nothing here imports faster-whisper or opens a device at import time.
"""

from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Sequence

import numpy as np

from .events import Event
from .protocol import Protocol

# Event emitted for every transcribed chunk (consumed by the language layer).
EV_TRANSCRIPT = "transcript"

# faster-whisper defaults. base.en / small.en are both fine; base.en is the
# lighter default. The model is never loaded at import time.
DEFAULT_MODEL_SIZE = "base.en"
DEFAULT_SAMPLE_RATE = 16000  # faster-whisper expects 16 kHz mono float32
DEFAULT_CHUNK_SECONDS = 4.0


# --------------------------------------------------------------------------- #
# Audio sources (the microphone sits behind this interface).
# --------------------------------------------------------------------------- #
class AudioSource(ABC):
    """Abstract source of mono float32 audio chunks at ``sample_rate`` Hz.

    ``read()`` returns the next chunk as a 1-D numpy float32 array (samples in
    [-1, 1]) or ``None`` when no audio is currently available / the stream has
    ended. Implementations must be safe to construct with no device attached.
    """

    sample_rate: int = DEFAULT_SAMPLE_RATE

    @abstractmethod
    def read(self) -> Optional[np.ndarray]:
        """Return the next audio chunk, or ``None`` if none is available."""

    def start(self) -> None:  # pragma: no cover - default is a no-op
        """Begin capture. Safe to call more than once."""

    def stop(self) -> None:  # pragma: no cover - default is a no-op
        """Stop capture and release any device. Safe to call more than once."""

    def available(self) -> bool:
        """Whether this source can actually produce audio (device present)."""
        return True


class MicAudioSource(AudioSource):
    """An :class:`AudioSource` backed by ``sounddevice`` (the real microphone).

    The device is opened lazily on :meth:`start`, so importing this module and
    constructing the source require no microphone and no ``sounddevice`` native
    library. If the device cannot be opened (the sandbox has none), the source
    reports ``available() == False`` and :meth:`read` returns ``None`` instead
    of raising, so the audio service degrades to disabled.
    """

    def __init__(
        self,
        *,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        chunk_seconds: float = DEFAULT_CHUNK_SECONDS,
        device: Optional[int] = None,
    ) -> None:
        self.sample_rate = int(sample_rate)
        self.chunk_seconds = float(chunk_seconds)
        self.device = device
        self._stream = None  # created lazily in start()
        self._sd = None  # the sounddevice module, imported lazily
        self._open_failed = False
        self._started = False

    @property
    def chunk_samples(self) -> int:
        return int(self.sample_rate * self.chunk_seconds)

    def _ensure_sd(self):
        """Import ``sounddevice`` lazily; swallow failures (headless sandbox)."""
        if self._sd is not None:
            return self._sd
        if self._open_failed:
            return None
        try:  # pragma: no cover - depends on a native audio backend
            import sounddevice as sd  # type: ignore

            self._sd = sd
            return sd
        except Exception:
            self._open_failed = True
            return None

    def start(self) -> None:
        if self._started:
            return
        sd = self._ensure_sd()
        if sd is None:
            return
        try:  # pragma: no cover - needs a real audio device
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                device=self.device,
                blocksize=self.chunk_samples,
            )
            self._stream.start()
            self._started = True
        except Exception:
            self._open_failed = True
            self._stream = None

    def available(self) -> bool:
        return self._ensure_sd() is not None and not self._open_failed

    def read(self) -> Optional[np.ndarray]:
        if not self._started:
            self.start()
        if self._stream is None:
            return None
        try:  # pragma: no cover - needs a real audio device
            frames, _overflowed = self._stream.read(self.chunk_samples)
            return np.asarray(frames, dtype=np.float32).reshape(-1)
        except Exception:
            return None

    def stop(self) -> None:
        if self._stream is not None:  # pragma: no cover - needs a real device
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None
        self._started = False


class ArrayAudioSource(AudioSource):
    """An :class:`AudioSource` that yields a fixed sequence of supplied chunks.

    Used by tests (and replay) to drive the pipeline deterministically with
    synthetic audio chunks and no microphone. Once the supplied chunks are
    exhausted :meth:`read` returns ``None``.
    """

    def __init__(
        self,
        chunks: Sequence[np.ndarray],
        *,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
    ) -> None:
        self.sample_rate = int(sample_rate)
        self._chunks: List[np.ndarray] = [
            np.asarray(c, dtype=np.float32).reshape(-1) for c in chunks
        ]
        self._index = 0

    def read(self) -> Optional[np.ndarray]:
        if self._index >= len(self._chunks):
            return None
        chunk = self._chunks[self._index]
        self._index += 1
        return chunk

    def append(self, chunk: np.ndarray) -> None:
        """Add another chunk to the queue (handy for streaming tests)."""
        self._chunks.append(np.asarray(chunk, dtype=np.float32).reshape(-1))

    def available(self) -> bool:
        return True


# --------------------------------------------------------------------------- #
# Transcriber (faster-whisper, lazily loaded and guarded).
# --------------------------------------------------------------------------- #
def build_initial_prompt(protocol: Optional[Protocol]) -> str:
    """Seed whisper's ``initial_prompt`` with the protocol's reagent vocabulary.

    Including the reagent labels (``Buffer A``, ``Reagent B``, ``Stop
    Solution``) biases transcription toward spelling the reagent names
    correctly, which is what the language layer later matches corrections
    against.
    """
    if protocol is None:
        return ""
    labels = [r.label for r in protocol.reagents.values() if r.label]
    if not labels:
        return ""
    vocab = ", ".join(labels)
    return (
        "Laboratory assay narration. Reagents mentioned may include: "
        f"{vocab}."
    )


@dataclass
class TranscriptSegment:
    """A transcribed chunk with wall-clock start/end offsets (seconds)."""

    text: str
    start: float
    end: float


class Transcriber:
    """Wraps faster-whisper with a lazy, guarded model load.

    The model is NOT loaded in ``__init__``: it is created on the first
    :meth:`transcribe` call (:meth:`load`), so importing this module and
    constructing a ``Transcriber`` download nothing and need no network. If the
    model cannot be loaded (no download, offline venue), :meth:`load` fails
    gracefully, :meth:`available` stays ``False`` and :meth:`transcribe` returns
    an empty string instead of raising. The protocol vocabulary seeds
    ``initial_prompt`` so reagent names transcribe correctly.
    """

    def __init__(
        self,
        protocol: Optional[Protocol] = None,
        *,
        model_size: str = DEFAULT_MODEL_SIZE,
        device: str = "cpu",
        compute_type: str = "int8",
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        model_factory: Optional[Callable[[], object]] = None,
    ) -> None:
        self.protocol = protocol
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.sample_rate = int(sample_rate)
        self.initial_prompt = build_initial_prompt(protocol)
        # ``model_factory`` lets tests inject a stub model without faster-whisper.
        self._model_factory = model_factory
        self._model = None
        self._load_failed = False

    def load(self) -> bool:
        """Load the model lazily. Returns True on success, False on any failure."""
        if self._model is not None:
            return True
        if self._load_failed:
            return False
        try:
            if self._model_factory is not None:
                self._model = self._model_factory()
            else:  # pragma: no cover - requires the real model download
                from faster_whisper import WhisperModel  # lazy, guarded import

                self._model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                )
            return True
        except Exception:
            self._load_failed = True
            self._model = None
            return False

    def available(self) -> bool:
        """Whether a model is loaded or can still be attempted."""
        return self._model is not None or not self._load_failed

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcribe one mono float32 chunk to text; '' when unavailable."""
        if audio is None or getattr(audio, "size", 0) == 0:
            return ""
        if not self.load():
            return ""
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        try:
            segments, _info = self._model.transcribe(  # type: ignore[union-attr]
                samples,
                language="en",
                initial_prompt=self.initial_prompt or None,
            )
            return "".join(getattr(seg, "text", "") for seg in segments).strip()
        except Exception:  # pragma: no cover - runtime transcription failure
            return ""


# --------------------------------------------------------------------------- #
# Audio service (chunked capture + transcription loop).
# --------------------------------------------------------------------------- #
@dataclass
class AudioStatus:
    """A lightweight status snapshot for the UI/logs."""

    enabled: bool = False
    detail: str = "audio disabled"


class AudioService:
    """Runs chunked local transcription and emits transcript events.

    The service reads chunks from an :class:`AudioSource`, transcribes each with
    the :class:`Transcriber`, and pushes an ``Event(source="audio",
    type="transcript", payload={text, start, end})`` to ``on_event`` for every
    non-empty transcription. The backend wires ``on_event`` to the language
    layer which classifies the text and attaches observations / corrections.

    Audio is fully OPTIONAL: if the source has no device or the model cannot
    load, :meth:`enabled` is ``False`` and the loop produces nothing, leaving
    the vision-only core unaffected. The service runs on a background daemon
    thread so it never blocks the WebSocket loop; tests can also drive it
    synchronously with :meth:`run_once` / :meth:`drain`.
    """

    def __init__(
        self,
        protocol: Protocol,
        source: AudioSource,
        transcriber: Optional[Transcriber] = None,
        *,
        on_event: Optional[Callable[[Event], None]] = None,
        clock: Callable[[], float] = time.time,
        poll_interval_s: float = 0.05,
    ) -> None:
        self.protocol = protocol
        self.source = source
        self.transcriber = transcriber or Transcriber(protocol)
        self.on_event = on_event
        self.clock = clock
        self.poll_interval_s = poll_interval_s
        self.status = AudioStatus()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._elapsed = 0.0  # cumulative seconds of audio consumed

    @property
    def sample_rate(self) -> int:
        return self.source.sample_rate

    def enabled(self) -> bool:
        """Whether audio can actually run (device present AND model loadable)."""
        return bool(self.source.available()) and bool(self.transcriber.available())

    # -- synchronous driving (used by tests and replay) -------------------- #
    # Sentinel distinguishing "source exhausted" from "chunk produced no text".
    _EXHAUSTED = object()

    def _process_chunk(self):
        """Read and transcribe one chunk.

        Returns the transcript :class:`Event`, ``None`` when the chunk produced
        no text (silent/unrecognized), or :attr:`_EXHAUSTED` when the source has
        no more audio. Never raises.
        """
        chunk = self.source.read()
        if chunk is None:
            return self._EXHAUSTED
        duration = len(chunk) / float(self.sample_rate or DEFAULT_SAMPLE_RATE)
        start = self._elapsed
        self._elapsed += duration
        text = self.transcriber.transcribe(chunk)
        if not text:
            return None
        event = Event(
            source="audio",
            type=EV_TRANSCRIPT,
            payload={
                "text": text,
                "start": round(start, 3),
                "end": round(self._elapsed, 3),
            },
            timestamp=self.clock(),
        )
        if self.on_event is not None:
            self.on_event(event)
        return event

    def run_once(self) -> Optional[Event]:
        """Read and transcribe one chunk; return the transcript Event or None.

        Returns ``None`` when the source is exhausted or the chunk produced no
        text. Never raises.
        """
        result = self._process_chunk()
        if result is self._EXHAUSTED:
            return None
        return result

    def drain(self) -> List[Event]:
        """Transcribe every remaining chunk; return all emitted events."""
        events: List[Event] = []
        while True:
            result = self._process_chunk()
            if result is self._EXHAUSTED:
                break
            if result is not None:
                events.append(result)
        return events

    # -- background loop (used by the live server) ------------------------- #
    def _loop(self) -> None:  # pragma: no cover - exercised only with a device
        self.source.start()
        while self._running:
            result = self._process_chunk()
            if result is self._EXHAUSTED or result is None:
                time.sleep(self.poll_interval_s)

    def start(self, *, threaded: bool = True) -> None:
        """Start the capture/transcription loop if audio is enabled."""
        if not self.enabled():
            self.status = AudioStatus(enabled=False, detail="audio disabled")
            return
        self.status = AudioStatus(enabled=True, detail="listening")
        self._running = True
        if threaded:  # pragma: no cover - background thread needs a device
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._running = False
        try:
            self.source.stop()
        except Exception:
            pass
        self.status = AudioStatus(enabled=False, detail="audio stopped")
