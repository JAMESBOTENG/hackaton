/**
 * TAO — live findings rail.
 *
 * Presentation only. A compact, horizontally-scrollable strip of the findings
 * gathered so far, split into two columns:
 *   • PRESENT — findings the patient has asserted (present/green token family).
 *   • DENIED  — findings explicitly ruled out (denied/muted-rose family).
 *
 * It fills in as the consultation streams, derived purely from the player's
 * cumulative asserted/negated sets (plus any live-mic asserted findings merged
 * upstream in TaoApp). Finding labels come from findingsById; denied findings
 * use negationLabel when available so "No fever" / "Neck not stiff" read
 * naturally.
 */
import { findingsById } from "../data/findings";

interface Props {
  asserted: string[];
  negated: string[];
}

function assertedLabel(id: string): string {
  return findingsById[id]?.label ?? id;
}

function deniedLabel(id: string): string {
  const f = findingsById[id];
  if (!f) return id;
  return f.negationLabel ?? `No ${f.label.toLowerCase()}`;
}

export default function FindingsRail({ asserted, negated }: Props) {
  const hasAny = asserted.length > 0 || negated.length > 0;

  return (
    <section
      aria-label="Findings gathered"
      className="rounded-xl border border-hairline bg-surface-raised p-3 shadow-card"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-eyebrow text-2xs font-semibold uppercase text-content-subtle">
          Findings gathered
        </h3>
        <span className="font-mono text-2xs tabular-nums text-content-subtle">
          {asserted.length + negated.length}
        </span>
      </div>

      {!hasAny ? (
        <p className="text-xs text-content-subtle">
          Findings will appear here as the patient answers.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Column
            title="Present"
            count={asserted.length}
            dot="bg-present-400"
            titleColor="text-present-300"
            empty="None yet"
          >
            {asserted.map((id) => (
              <Chip
                key={id}
                tone="bg-present-500/10 text-present-200 ring-present-500/25"
              >
                {assertedLabel(id)}
              </Chip>
            ))}
          </Column>

          <Column
            title="Ruled out"
            count={negated.length}
            dot="bg-denied-400"
            titleColor="text-denied-300"
            empty="None yet"
          >
            {negated.map((id) => (
              <Chip
                key={id}
                tone="bg-denied-500/10 text-denied-200 ring-denied-500/25"
              >
                {deniedLabel(id)}
              </Chip>
            ))}
          </Column>
        </div>
      )}
    </section>
  );
}

function Column({
  title,
  count,
  dot,
  titleColor,
  empty,
  children,
}: {
  title: string;
  count: number;
  dot: string;
  titleColor: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        <span className={`text-2xs font-semibold uppercase tracking-wide ${titleColor}`}>
          {title}
        </span>
        <span className="font-mono text-2xs tabular-nums text-content-subtle">
          {count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {count === 0 ? (
          <span className="text-2xs text-content-subtle">{empty}</span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`animate-rise-in rounded-md px-2 py-0.5 text-2xs font-medium ring-1 ${tone}`}
    >
      {children}
    </span>
  );
}
