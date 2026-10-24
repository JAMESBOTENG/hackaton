import { describe, expect, it, vi } from "vitest";
import {
  startRecognition,
  stopRecognition,
  type MicState,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
} from "./speech";

class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = true;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  constructor() { FakeRecognition.instances.push(this); }
}

const finalResult = (text: string): SpeechRecognitionResultEventLike => ({
  resultIndex: 0,
  results: [{ 0: { transcript: text }, isFinal: true }],
});

function setup() {
  FakeRecognition.instances = [];
  const ref: { current: SpeechRecognitionLike | null } = { current: null };
  const active = { current: true };
  const states: MicState[] = [];
  const texts: string[] = [];
  const begin = () => startRecognition(ref, active, (text) => texts.push(text), (state) => states.push(state), FakeRecognition);
  return { ref, active, states, texts, begin };
}

describe("guarded speech recognition", () => {
  it("ignores a delayed onstart after cancellation", () => {
    const session = setup();
    session.begin();
    const recognition = FakeRecognition.instances[0];
    stopRecognition(session.ref);
    recognition.onstart?.();
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(session.states).toEqual([]);
  });

  it("ignores stale result and end callbacks after replacement and unmount", () => {
    const session = setup();
    session.begin();
    const stale = FakeRecognition.instances[0];
    session.begin();
    const current = FakeRecognition.instances[1];
    stale.onstart?.();
    stale.onresult?.(finalResult("stale words"));
    stale.onend?.();
    expect(session.states).toEqual([]);
    expect(session.texts).toEqual([]);

    session.active.current = false;
    stopRecognition(session.ref);
    current.onstart?.();
    current.onresult?.(finalResult("after unmount"));
    current.onerror?.();
    current.onend?.();
    expect(session.states).toEqual([]);
    expect(session.texts).toEqual([]);
  });

  it("reports normal start, final result, and clean end transitions", () => {
    const session = setup();
    session.begin();
    const recognition = FakeRecognition.instances[0];
    recognition.onstart?.();
    recognition.onresult?.(finalResult("  useful transcript  "));
    recognition.onend?.();
    expect(session.states).toEqual(["listening", "idle"]);
    expect(session.texts).toEqual(["useful transcript"]);
    expect(session.ref.current).toBeNull();
  });

  it("reports an active recognition error once and ignores its later end", () => {
    const session = setup();
    session.begin();
    const recognition = FakeRecognition.instances[0];
    recognition.onstart?.();
    recognition.onerror?.();
    recognition.onend?.();
    expect(session.states).toEqual(["listening", "error"]);
    expect(session.ref.current).toBeNull();
  });
});
