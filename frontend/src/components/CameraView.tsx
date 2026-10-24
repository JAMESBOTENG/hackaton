import type { ProtocolView } from "../types";

/**
 * The live rectified camera feed with zone overlays. Zones 1-3 are the reagent
 * home zones (top row) and zone 4 is the target (lower center), matching the
 * backend DEFAULT_ZONES layout in app/vision.py. When no frame is available we
 * show a "camera not detected" placeholder rather than breaking.
 */

// Normalized [0,1] rectangles mirroring app/vision.py DEFAULT_ZONES.
const ZONE_RECTS: Record<number, { x: number; y: number; w: number; h: number }> = {
  1: { x: 0.05, y: 0.08, w: 0.26, h: 0.34 },
  2: { x: 0.37, y: 0.08, w: 0.26, h: 0.34 },
  3: { x: 0.69, y: 0.08, w: 0.26, h: 0.34 },
  4: { x: 0.3, y: 0.55, w: 0.4, h: 0.38 },
};

interface Props {
  jpegB64: string | null;
  protocol: ProtocolView | null;
  statusDetail: string;
}

export default function CameraView({ jpegB64, protocol, statusDetail }: Props) {
  const reagentByZone: Record<number, string> = {};
  if (protocol) {
    for (const r of Object.values(protocol.reagents)) {
      reagentByZone[r.zone] = r.label;
    }
    reagentByZone[protocol.target_zone] = "Target";
  }

  return (
    <div className="relative aspect-[840/594] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      {jpegB64 ? (
        <img
          src={`data:image/jpeg;base64,${jpegB64}`}
          alt="Rectified bench mat"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-center text-slate-500">
          <div>
            <div className="text-lg font-medium text-slate-400">
              Camera not detected
            </div>
            <div className="mt-1 text-sm">{statusDetail || "Waiting for a frame…"}</div>
          </div>
        </div>
      )}

      {/* Zone overlays */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {Object.entries(ZONE_RECTS).map(([id, r]) => {
          const zoneId = Number(id);
          const isTarget = protocol ? zoneId === protocol.target_zone : zoneId === 4;
          return (
            <g key={id}>
              <rect
                x={r.x * 100}
                y={r.y * 100}
                width={r.w * 100}
                height={r.h * 100}
                fill="none"
                stroke={isTarget ? "#f59e0b" : "#38bdf8"}
                strokeWidth={0.6}
                strokeDasharray={isTarget ? "2 1" : undefined}
                rx={1}
              />
              <text
                x={r.x * 100 + 1.5}
                y={r.y * 100 + 4}
                fill={isTarget ? "#f59e0b" : "#38bdf8"}
                fontSize={3}
              >
                {zoneId}
                {reagentByZone[zoneId] ? ` · ${reagentByZone[zoneId]}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
