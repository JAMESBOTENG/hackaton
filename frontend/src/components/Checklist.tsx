import type { ProtocolView } from "../types";

/**
 * The protocol as a self-ticking checklist. Each step ticks off when the
 * backend reports it in ``completed`` (derived from step_completed engine
 * events); the current step is highlighted.
 */
interface Props {
  protocol: ProtocolView | null;
  completed: number[];
  currentStepId: number | null;
}

export default function Checklist({ protocol, completed, currentStepId }: Props) {
  if (!protocol) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-slate-500">
        Select a protocol to see the checklist.
      </div>
    );
  }
  const done = new Set(completed);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-lg font-medium">{protocol.name}</h2>
      <ol className="space-y-2">
        {protocol.steps.map((step) => {
          const isDone = done.has(step.id);
          const isCurrent = step.id === currentStepId;
          return (
            <li
              key={step.id}
              className={[
                "flex items-start gap-3 rounded-md border px-3 py-2 transition-colors",
                isCurrent
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-transparent",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-xs",
                  isDone
                    ? "border-emerald-500 bg-emerald-500 text-slate-950"
                    : "border-slate-600 text-slate-500",
                ].join(" ")}
              >
                {isDone ? "✓" : step.id}
              </span>
              <div className="min-w-0">
                <div
                  className={[
                    "text-sm",
                    isDone ? "text-slate-500 line-through" : "text-slate-100",
                  ].join(" ")}
                >
                  {step.description}
                </div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {step.type}
                  {step.type === "incubate" && step.duration_s
                    ? ` · ${step.duration_s}s`
                    : ""}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
