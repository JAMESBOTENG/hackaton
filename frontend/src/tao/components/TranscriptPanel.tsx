/**
 * TAO — live transcript panel (right column).
 *
 * Renders the doctor-patient consultation as it streams in, visually
 * distinguishing the two speakers, and auto-scrolls to keep the latest line in
 * view. Turns that revealed or negated a clinical finding are subtly marked so
 * the clinician can see WHERE the evidence on the board came from.
 *
 * Presentation only: it is handed the accumulated transcript by TaoApp and does
 * no scoring or playback itself.
 */
import { useEffect, useRef } from "react";
import type { ConsultationTurn } from "../data/consultation";
import { findingsById } from "../data/findings";

interface Props {
  /** Turns delivered so far, in order. */
  transcript: ConsultationTurn[];
  /** True once playback has started (controls the empty-state copy). */
  started: boolean;
  /** Optional label for a live (mic) source appended to the scripted turns. */
  liveListening?: boolean;
}

export default function TranscriptPanel({
  transcript,
  started,
  liveListening,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest turn whenever the transcript grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Consultation transcript
        </h2>
        {liveListening ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-rose-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
            Listening
          </span>
        ) : (
          <span className="text-xs text-slate-500">
            {started ? "Live" : "Ready"}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {transcript.length === 0 ? (
          <p className="mt-6 text-center text-sm text-slate-500">
            {started
              ? "Waiting for the first exchange…"
              : "Press Start to play the consultation."}
          </p>
        ) : (
          transcript.map((turn, i) => <TurnBubble key={i} turn={turn} />)
        )}
      </div>
    </section>
  );
}

function TurnBubble({ turn }: { turn: ConsultationTurn }) {
  const isDoctor = turn.speaker === "doctor";
  const revealed = turn.revealsFindings ?? [];
  const negated = turn.negatesFindings ?? [];
  const chips = [
    ...revealed.map((id) => ({ id, negated: false })),
    ...negated.map((id) => ({ id, negated: true })),
  ];

  return (
    <div className={`flex ${isDoctor ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] ${isDoctor ? "items-start" : "items-end"}`}>
        <div
          className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
            isDoctor ? "text-sky-300" : "text-emerald-300"
          }`}
        >
          {isDoctor ? "Doctor" : "Patient"}
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
            isDoctor
              ? "rounded-tl-sm bg-sky-500/10 text-sky-50 ring-1 ring-sky-500/20"
              : "rounded-tr-sm bg-emerald-500/10 text-emerald-50 ring-1 ring-emerald-500/20"
          }`}
        >
          {turn.text}
        </div>
        {chips.length > 0 && (
          <div
            className={`mt-1.5 flex flex-wrap gap-1 ${
              isDoctor ? "justify-start" : "justify-end"
            }`}
          >
            {chips.map(({ id, negated }) => {
              const finding = findingsById[id];
              if (!finding) return null;
              const label = negated
                ? finding.negationLabel ?? `No ${finding.label.toLowerCase()}`
                : finding.label;
              return (
                <span
                  key={`${id}-${negated ? "neg" : "pos"}`}
                  title={negated ? "Finding ruled out" : "Finding detected"}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    negated
                      ? "bg-slate-700/60 text-slate-300 line-through decoration-slate-500"
                      : "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30"
                  }`}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
