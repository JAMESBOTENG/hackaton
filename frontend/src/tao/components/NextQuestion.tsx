/**
 * TAO — "Suggested next question" headline card.
 *
 * Presentation only. Consumes the deterministic suggestNextQuestion() result
 * (engine/nextQuestion.ts) and renders it as the single most valuable question
 * to ask next, with a concise explanation of WHICH leading conditions the
 * answer would separate. It updates live as the consultation streams: once the
 * finding arrives in the transcript and the board narrows, the next-best
 * question naturally takes its place.
 *
 * When there is nothing left to discriminate (suggestNextQuestion returns
 * null — e.g. before playback, or when the leaders can no longer be separated)
 * it renders a calm "no further discriminating question" state rather than
 * disappearing, so the board header stays stable.
 */
import type { NextQuestionSuggestion } from "../engine/nextQuestion";

interface Props {
  suggestion: NextQuestionSuggestion | null;
}

export default function NextQuestion({ suggestion }: Props) {
  return (
    <section
      aria-label="Suggested next question"
      className="animate-rise-in rounded-xl border border-brand-800/60 bg-gradient-to-br from-brand-950 to-surface-raised p-4 shadow-raised ring-1 ring-brand-500/15"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 2a6 6 0 00-3.5 10.87c.3.22.5.57.5.94V15a1 1 0 001 1h4a1 1 0 001-1v-1.19c0-.37.2-.72.5-.94A6 6 0 0010 2zM8 18a1 1 0 001 1h2a1 1 0 001-1v-.5H8V18z" />
          </svg>
        </span>
        <h3 className="text-eyebrow text-2xs font-semibold uppercase text-brand-300">
          Suggested next question
        </h3>
      </div>

      {suggestion ? (
        <>
          <p className="mt-2.5 text-lg font-semibold leading-snug text-content">
            {suggestion.prompt}
          </p>

          {suggestion.separates.length > 0 && (
            <div className="mt-3">
              <p className="text-2xs font-medium uppercase tracking-wide text-content-subtle">
                Why — this would help separate
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestion.separates.slice(0, 4).map((leader) => (
                  <span
                    key={leader.conditionId}
                    className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-inset px-2 py-1 text-xs text-content-muted"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        leader.weight >= 0 ? "bg-present-400" : "bg-denied-400"
                      }`}
                      aria-hidden
                    />
                    {leader.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="mt-2.5 text-sm leading-relaxed text-content-muted">
          No further discriminating question right now. Start the consultation,
          or the leading conditions can no longer be separated by a single
          finding.
        </p>
      )}
    </section>
  );
}
