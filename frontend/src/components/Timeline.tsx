import type { BenchEvent } from "../types";

/**
 * Chronological list of events and observations, each tagged with a timestamp
 * and its source (vision / audio / engine / user). The timeline derives purely
 * from the event log, the single source of truth.
 */
interface Props {
  events: BenchEvent[];
}

const SOURCE_COLORS: Record<string, string> = {
  vision: "bg-sky-500/20 text-sky-300",
  audio: "bg-violet-500/20 text-violet-300",
  engine: "bg-emerald-500/20 text-emerald-300",
  user: "bg-amber-500/20 text-amber-300",
};

function describe(ev: BenchEvent): string {
  const p = ev.payload as Record<string, unknown>;
  if (typeof p.message === "string") return p.message;
  if (typeof p.description === "string") return p.description;
  if (typeof p.bottle === "string") return `${ev.type}: ${p.bottle}`;
  if (typeof p.text === "string") return p.text;
  return ev.type;
}

function clock(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export default function Timeline({ events }: Props) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-800 bg-slate-900">
      <h2 className="border-b border-slate-800 px-4 py-3 text-lg font-medium">
        Timeline
      </h2>
      <ol className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {events.length === 0 && (
          <li className="text-slate-500">No events yet.</li>
        )}
        {events
          .slice()
          .reverse()
          .map((ev, i) => (
            <li
              key={`${ev.timestamp}-${i}`}
              className="flex items-start gap-2 rounded-md px-2 py-1 hover:bg-slate-800/50"
            >
              <span className="mt-0.5 font-mono text-xs text-slate-500">
                {clock(ev.timestamp)}
              </span>
              <span
                className={[
                  "mt-0.5 flex-none rounded px-1.5 py-0.5 text-[10px] uppercase",
                  SOURCE_COLORS[ev.source] ?? "bg-slate-700 text-slate-300",
                ].join(" ")}
              >
                {ev.source}
              </span>
              <span className="min-w-0 text-slate-200">{describe(ev)}</span>
            </li>
          ))}
      </ol>
    </div>
  );
}
