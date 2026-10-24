import type { AlertState } from "../types";

/**
 * Prominent banner showing the latest spoken alert (deviation / timer warning /
 * overrun). Alerts are short and rare by design; the text is also spoken via
 * window.speechSynthesis (handled in App.tsx).
 */
interface Props {
  alert: AlertState | null;
}

const STYLES: Record<string, string> = {
  deviation: "border-rose-500 bg-rose-500/15 text-rose-100",
  warning: "border-amber-500 bg-amber-500/15 text-amber-100",
  overrun: "border-orange-500 bg-orange-500/15 text-orange-100",
};

const LABELS: Record<string, string> = {
  deviation: "Deviation",
  warning: "Timer warning",
  overrun: "Overrun",
};

export default function AlertBanner({ alert }: Props) {
  if (!alert) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-slate-500">
        No alerts. Benchwatch stays quiet unless something needs attention.
      </div>
    );
  }
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "rounded-lg border px-4 py-3",
        STYLES[alert.severity] ?? STYLES.deviation,
      ].join(" ")}
    >
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {LABELS[alert.severity] ?? "Alert"}
      </div>
      <div className="mt-1 text-lg font-medium">{alert.text}</div>
    </div>
  );
}
