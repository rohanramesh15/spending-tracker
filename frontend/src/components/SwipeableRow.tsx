import { useRef, useState, type PointerEvent, type ReactNode } from "react";

// How far (as a fraction of the actions' own width) the row must be dragged before
// releasing snaps it open rather than springing back closed.
const OPEN_THRESHOLD_RATIO = 0.4;
// Pixels of movement before a gesture commits to horizontal (drag) vs vertical (page
// scroll) — this is what lets a diagonal-ish touch still scroll the page normally.
const AXIS_LOCK_PX = 8;

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startDragX: number;
  axis: "horizontal" | "vertical" | null;
}

/**
 * A list row that reveals action buttons (edit/hide/delete) when dragged left — built on
 * the Pointer Events API, which unifies mouse, touch, and pen under one event model. An
 * earlier version relied on native CSS scroll-snap, which only responds to real touch
 * gestures and trackpad horizontal scroll — it silently did nothing for a mouse click-drag,
 * which is most of how this app gets used on desktop. Pointer Events fix that by design.
 *
 * The row's content translates with the drag in real time (not a binary open/closed jump),
 * axis-locks to whichever direction the gesture actually commits to (so a mostly-vertical
 * touch still scrolls the page instead of getting hijacked), and springs to fully open or
 * fully closed on release depending on how far it was dragged.
 */
export function SwipeableRow({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  function actionsWidth(): number {
    return actionsRef.current?.getBoundingClientRect().width ?? 0;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return; // left-click only
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startDragX: dragX,
      axis: null,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      if (d.axis === "horizontal") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      } else {
        drag.current = null; // vertical intent — release the gesture to native page scroll
        return;
      }
    }
    if (d.axis !== "horizontal") return;

    e.preventDefault();
    const max = actionsWidth();
    setDragX(Math.min(0, Math.max(-max, d.startDragX + dx)));
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (d.axis !== "horizontal") return;
    const max = actionsWidth();
    setDragX(Math.abs(dragX) > max * OPEN_THRESHOLD_RATIO ? -max : 0);
  }

  return (
    <div className="relative overflow-hidden">
      <div ref={actionsRef} className="absolute inset-y-0 right-0 flex">
        {actions}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => dragX !== 0 && setDragX(0)}
        className="relative bg-background"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y", // let vertical page-scroll stay native; we own horizontal
          cursor: dragX !== 0 ? "pointer" : "grab",
          userSelect: dragging ? "none" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
