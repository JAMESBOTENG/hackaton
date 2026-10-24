/**
 * TAO — the diagnostic probability board (left + center, majority of the page).
 *
 * Renders the ranked conditions as color-coded cards sorted by probability and
 * animates the RESHUFFLE as the ranking changes while the consultation plays.
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
 */
import { useLayoutEffect, useRef } from "react";
import type { ScoredCondition } from "../engine/score";
import ProbabilityCard from "./ProbabilityCard";

interface Props {
  scored: ScoredCondition[];
  onSelect: (conditionId: string) => void;
}

export default function ProbabilityBoard({ scored, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Map of conditionId -> last known bounding-box top, for FLIP.
  const positions = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
          // First + Invert: jump the card back to where it was, no transition.
          card.style.transition = "none";
          card.style.transform = `translateY(${delta}px)`;
          // Play: next frame, animate the transform away to its new spot.
          requestAnimationFrame(() => {
            card.style.transition = "transform 500ms cubic-bezier(0.22,1,0.36,1)";
            card.style.transform = "";
          });
        }
      }
      positions.current.set(id, newTop);
    }
  }, [scored]);

  return (
    <div ref={containerRef} className="space-y-2.5">
      {scored.map((s, i) => (
        <div key={s.conditionId} data-card-id={s.conditionId} className="will-change-transform">
          <ProbabilityCard
            scored={s}
            rank={i}
            onClick={() => onSelect(s.conditionId)}
          />
        </div>
      ))}
    </div>
  );
}
