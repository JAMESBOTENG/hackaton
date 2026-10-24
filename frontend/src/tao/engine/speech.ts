export type MicState = "idle" | "requesting" | "listening" | "error";

export interface MutableCurrent<T> { current: T; }

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function browserConstructor(): SpeechRecognitionConstructor | undefined {
  try {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  } catch {
    return undefined;
  }
}

/** Start optional browser recognition with identity and component-lifetime guards. */
export function startRecognition(
  ref: MutableCurrent<SpeechRecognitionLike | null>,
  active: MutableCurrent<boolean>,
  onText: (text: string) => void,
  onState: (state: MicState) => void,
  Recognition: SpeechRecognitionConstructor | undefined = browserConstructor()
): void {
  stopRecognition(ref);
  const updateState = (state: MicState) => { if (active.current) onState(state); };
  if (!Recognition) { updateState("error"); return; }

  try {
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    let failed = false;
    const isCurrent = () => active.current && ref.current === recognition;

    recognition.onstart = () => { if (isCurrent()) onState("listening"); };
    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      try {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result.isFinal) continue;
          const text = String(result[0]?.transcript ?? "").trim();
          if (text && isCurrent()) onText(text);
        }
      } catch {
        if (isCurrent()) onState("error");
      }
    };
    recognition.onerror = () => {
      if (!isCurrent()) return;
      failed = true;
      ref.current = null;
      onState("error");
    };
    recognition.onend = () => {
      if (!isCurrent()) return;
      ref.current = null;
      if (!failed) onState("idle");
    };
    ref.current = recognition;
    recognition.start();
  } catch {
    ref.current = null;
    updateState("error");
  }
}

/** Invalidate ownership before stop so synchronous or delayed callbacks are stale. */
export function stopRecognition(ref: MutableCurrent<SpeechRecognitionLike | null>): void {
  const recognition = ref.current;
  ref.current = null;
  try { recognition?.stop(); } catch { /* Optional browser API must never throw into core flow. */ }
}
