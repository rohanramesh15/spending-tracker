import type { ReactNode } from "react";

/**
 * A list row that reveals action buttons (edit/delete) when dragged left. Built on native
 * CSS scroll-snap rather than a gesture library or hand-rolled pointer-event math — the
 * browser's own touch-scroll handling already tells a horizontal swipe apart from the
 * page's vertical scroll, which is the part that's genuinely easy to get wrong by hand.
 *
 * The row content and the actions sit side by side in a horizontally-scrollable, snapping
 * track; dragging left scrolls the actions into view and snaps there, dragging back (or
 * tapping a revealed action) returns it to the closed, content-only position.
 */
export function SwipeableRow({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden">
      <div className="swipe-row-track flex snap-x snap-mandatory overflow-x-auto">
        <div className="swipe-row-snap w-full shrink-0 snap-start">{children}</div>
        <div className="swipe-row-snap flex shrink-0 snap-end">{actions}</div>
      </div>
    </div>
  );
}
