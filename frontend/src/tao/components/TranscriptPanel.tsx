/**
 * TAO — live transcript panel (right column).
 *
 * Renders the doctor-patient consultation as it streams in, visually
 * distinguishing the two speakers, and auto-scrolls to keep the latest line in
 * view. Turns that revealed or negated a clinical finding are marked with
 * present/denied chips so the clinician can see WHERE the board's evidence came
 * from. The single latest finding-bearing turn gets a brief shared accent that
 * ties the spoken line to the card(s) it moved on the board (left).
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

/** Index of the most recent turn that revealed/negated at least one finding. */
function lastFindingTurnIndex(transcript: ConsultationTurn[]): number {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i];
    if ((t.revealsFindings?.length ?? 0) + (t.negatesFindings?.length ?? 0) > 0) {
      return i;
    }
  }
  return -1;
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

  const linkIndex = lastFindingTurnIndex(transcript);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-hairline bg-surface-raised shadow-raised">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-eyebrow text-2xs font-semibold uppercase text-content-muted">
          Consultation transcript
        </h2>
        {liveListening ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-critical-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-critical-400" />
            Listening
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-content-subtle">
            {started && (
              <span className="h-1.5 w-1.5 rounded-full bg-present-400" />
            )}
            {started ? "Live" : "Ready"}
          </span>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {transcript.length === 0 ? (
          <p className="mt-6 text-center text-sm text-content-subtle">
            {started
              ? "Waiting for the first exchange…"
              : "Press Start to play the consultation."}
          </p>
        ) : (
          transcript.map((turn, i) => (
            <TurnBubble key={i} turn={turn} linked={i === linkIndex} />
          ))
        )}
      </div>
    </section>
  );
}

function TurnBubble({
  turn,
  linked,
}: {
  turn: ConsultationTurn;
  linked: boolean;
}) {
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
          className={`mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide ${
            isDoctor
              ? "text-brand-300"
              : "justify-end text-present-300"
          }`}
        >
          {isDoctor ? "Doctor" : "Patient"}
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed transition-shadow ${
            isDoctor
              ? "rounded-tl-sm bg-brand-500/10 text-content ring-1 ring-brand-500/25"
              : "rounded-tr-sm bg-surface-inset text-content ring-1 ring-hairline"
          } ${linked ? "ring-2 ring-brand-400/70" : ""}`}
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
                  className={`animate-rise-in rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                    negated
                      ? "bg-denied-500/10 text-denied-200 ring-denied-500/25 line-through decoration-denied-400/60"
                      : "bg-present-500/10 text-present-200 ring-present-500/25"
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
