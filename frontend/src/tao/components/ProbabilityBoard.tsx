/**
 * TAO — the diagnostic probability board (left + center, majority of the page).
 *
 * Renders the ranked conditions as color-coded cards sorted by probability and
 * animates the cinematic RESHUFFLE as the ranking changes while the
 * consultation plays.
 *
 * ── Smooth reshuffle without a heavy animation lib (FLIP) ──────────────────
 * We keep the DOM order = ranking order (so tab/reading order is correct), and
 * animate movement with the FLIP technique using only CSS transforms:
 *   1. Before each re-render, record each card's screen position (First).
 *   2. After React commits the new order, read the new position (Last).
 *   3. Invert: translate each card from Last back to First with transform.
 *   4. Play: on the next frame, clear the transform so the CSS transition
 *      glides each card to its real position.
 * This gives buttery reorder animations with zero dependencies.
 *
 * ── Per-turn delta + pulse + transcript link ───────────────────────────────
 * We track the PREVIOUS probability of every condition in a ref keyed by
 * conditionId. Each render computes a signed delta, flags cards that changed
 * meaningfully for a one-shot highlight pulse, and flags cards the latest
 * transcript turn directly touched (its revealed/negated findings appear in the
 * card's weighted findings) so the moved card and the spoken line share a brief
 * accent. All motion respects prefers-reduced-motion (handled globally in
 * index.css).
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ScoredCondition } from "../engine/score";
import { conditionsById } from "../data/conditions";
import ProbabilityCard from "./ProbabilityCard";

interface Props {
  scored: ScoredCondition[];
  /** Finding ids the latest transcript turn revealed or negated (for the link). */
  lastTurnFindings?: string[];
  onSelect: (conditionId: string) => void;
}

/** A probability change this small is treated as noise (no pulse/badge). */
const MEANINGFUL_DELTA = 0.02;

export default function ProbabilityBoard({
  scored,
  lastTurnFindings = [],
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Map of conditionId -> last known bounding-box top, for FLIP.
  const positions = useRef<Map<string, number>>(new Map());
  // Map of conditionId -> probability at the PREVIOUS render, for deltas.
  const prevProb = useRef<Map<string, number>>(new Map());

  // Compute per-card delta + pulse + linked flags against the previous snapshot.
  // Done in a memo so the ref update below sees the same values we render.
  const meta = useMemo(() => {
    const touched = new Set(lastTurnFindings);
    const m = new Map<
      string,
      { delta: number; pulse: boolean; linked: boolean }
    >();
    for (const s of scored) {
      const prev = prevProb.current.get(s.conditionId);
      const delta = prev === undefined ? 0 : s.probability - prev;
      const pulse = prev !== undefined && Math.abs(delta) >= MEANINGFUL_DELTA;
      const condition = conditionsById[s.conditionId];
      const linked =
        touched.size > 0 &&
        !!condition &&
        Object.keys(condition.findingWeights).some((id) => touched.has(id));
      m.set(s.conditionId, { delta, pulse, linked });
    }
    return m;
    // Recompute only when the ranking or the triggering turn changes.
  }, [scored, lastTurnFindings]);

  // FLIP reorder + commit the current probabilities as the next baseline.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) {
      const cards = Array.from(
        container.querySelectorAll<HTMLElement>("[data-card-id]")
      );
      for (const card of cards) {
        const id = card.dataset.cardId!;
        const newTop = card.getBoundingClientRect().top;
        const oldTop = positions.current.get(id);
        if (oldTop !== undefined) {
          const delta = oldTop - newTop;
          if (Math.abs(delta) > 1) {
            card.style.transition = "none";
            card.style.transform = `translateY(${delta}px)`;
            requestAnimationFrame(() => {
              card.style.transition =
                "transform 520ms cubic-bezier(0.22,1,0.36,1)";
              card.style.transform = "";
            });
          }
        }
        positions.current.set(id, newTop);
      }
    }

    // Record current probabilities so the NEXT render can diff against them.
    const next = new Map<string, number>();
    for (const s of scored) next.set(s.conditionId, s.probability);
    prevProb.current = next;
  }, [scored]);

  return (
    <div ref={containerRef} className="space-y-2.5">
      {scored.map((s, i) => {
        const info = meta.get(s.conditionId) ?? {
          delta: 0,
          pulse: false,
          linked: false,
        };
        return (
          <div
            key={s.conditionId}
            data-card-id={s.conditionId}
            className="will-change-transform"
          >
            <ProbabilityCard
              scored={s}
              rank={i}
              delta={info.delta}
              pulse={info.pulse}
              linked={info.linked}
              onClick={() => onSelect(s.conditionId)}
            />
          </div>
        );
      })}
    </div>
  );
}
