import type { BenchEvent, ProtocolView } from "../types";

/**
 * Replay-mode stand-in for the live rectified camera feed. There is no camera
 * in the browser-only demo, so instead of a broken/empty video element we draw
 * a tasteful "simulated feed" bench-mat: the same zone layout as the live
 * CameraView (zones 1-3 reagent homes along the top, zone 4 target lower
 * center) rendered over a dark bench graphic, consistent with the dashboard
 * theme. As the replay lifts / moves bottles, the matching zone is highlighted
 * so the viewer can follow the action.
 */

// Normalized [0,1] rectangles mirroring app/vision.py DEFAULT_ZONES and the
// live CameraView component.
const ZONE_RECTS: Record<number, { x: number; y: number; w: number; h: number }> = {
  1: { x: 0.05, y: 0.08, w: 0.26, h: 0.34 },
  2: { x: 0.37, y: 0.08, w: 0.26, h: 0.34 },
  3: { x: 0.69, y: 0.08, w: 0.26, h: 0.34 },
  4: { x: 0.3, y: 0.55, w: 0.4, h: 0.38 },
};

const CAP_COLORS: Record<string, string> = {
  blue: "#38bdf8",
  yellow: "#facc15",
  red: "#f87171",
};

interface Props {
  protocol: ProtocolView;
  events: BenchEvent[];
}

/**
 * Figure out which reagent (if any) is currently "active" (lifted / over the
 * target) from the most recent vision event, and whether it is currently over
 * the target zone. A `bottle_returned` clears the active bottle.
 */
function activeBottle(events: BenchEvent[]): {
  bottle: string | null;
  overTarget: boolean;
} {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.source !== "vision") continue;
    const bottle = typeof ev.payload.bottle === "string" ? ev.payload.bottle : null;
    if (ev.type === "bottle_returned") return { bottle: null, overTarget: false };
    if (ev.type === "bottle_lifted") return { bottle, overTarget: false };
    if (ev.type === "bottle_over_target") return { bottle, overTarget: true };
  }
  return { bottle: null, overTarget: false };
}

export default function SimulatedCameraView({ protocol, events }: Props) {
  const reagentByZone: Record<number, string> = {};
  const colorByZone: Record<number, string> = {};
  for (const r of Object.values(protocol.reagents)) {
    reagentByZone[r.zone] = r.label;
    colorByZone[r.zone] = CAP_COLORS[r.cap_color] ?? "#38bdf8";
  }
  reagentByZone[protocol.target_zone] = "Target";

  const zoneOf: Record<string, number> = {};
  for (const r of Object.values(protocol.reagents)) zoneOf[r.key] = r.zone;

  const { bottle, overTarget } = activeBottle(events);
  const activeZone = bottle
    ? overTarget
      ? protocol.target_zone
      : zoneOf[bottle] ?? null
    : null;

  return (
    <div className="relative aspect-[840/594] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      {/* Bench-mat backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="absolute left-3 top-2 rounded bg-slate-950/70 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
        Simulated feed · replay
      </div>

      {/* Zone overlays */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {Object.entries(ZONE_RECTS).map(([id, r]) => {
          const zoneId = Number(id);
          const isTarget = zoneId === protocol.target_zone;
          const isActive = zoneId === activeZone;
          const stroke = isTarget ? "#f59e0b" : colorByZone[zoneId] ?? "#38bdf8";
          return (
            <g key={id}>
              <rect
                x={r.x * 100}
                y={r.y * 100}
                width={r.w * 100}
                height={r.h * 100}
                fill={isActive ? (isTarget ? "#f59e0b22" : `${stroke}22`) : "none"}
                stroke={stroke}
                strokeWidth={isActive ? 1.2 : 0.6}
                strokeDasharray={isTarget ? "2 1" : undefined}
                rx={1}
              />
              <text
                x={r.x * 100 + 1.5}
                y={r.y * 100 + 4}
                fill={stroke}
                fontSize={3}
              >
                {zoneId}
                {reagentByZone[zoneId] ? ` · ${reagentByZone[zoneId]}` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-2 right-3 rounded bg-slate-950/70 px-2 py-0.5 text-[11px] text-slate-400">
        {bottle
          ? `${reagentByZone[zoneOf[bottle]] ?? bottle} ${
              overTarget ? "over target" : "lifted"
            }`
          : "bench idle"}
      </div>
    </div>
  );
}
