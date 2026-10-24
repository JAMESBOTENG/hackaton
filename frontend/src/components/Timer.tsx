import type { TimerState } from "../types";

/**
 * Live countdown for the active incubate step, driven by the backend ``timer``
 * messages (the engine owns the timer; we only render it). Turns amber once the
 * remaining time is at or below the configured warning window.
 */
interface Props {
  timer: TimerState | null;
}

export default function Timer({ timer }: Props) {
  if (!timer || !timer.running) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-slate-500">
        No active incubation.
      </div>
    );
  }
  const { remainingS, durationS, warnAtS } = timer;
  // warn_at_s is the elapsed time at which to warn; warn when remaining is at
  // or below (duration - warn_at_s).
  const warnRemaining = warnAtS != null ? durationS - warnAtS : 0;
  const warning = remainingS <= warnRemaining;
  const pct = durationS > 0 ? Math.max(0, Math.min(1, remainingS / durationS)) : 0;

  return (
    <div
      className={[
        "rounded-lg border p-4",
        warning
          ? "border-amber-500 bg-amber-500/10"
          : "border-slate-800 bg-slate-900",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-400">Incubation (step {timer.stepId})</span>
        <span
          className={[
            "font-mono text-3xl tabular-nums",
            warning ? "text-amber-400" : "text-slate-100",
          ].join(" ")}
        >
          {Math.ceil(remainingS)}s
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={warning ? "h-full bg-amber-500" : "h-full bg-sky-500"}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
