"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";

type BaseDragState = { id: string; order: string[] };

/**
 * Press-and-drag reordering: a short move threshold starts the drag, Escape or
 * pointercancel abandons it, and the click that ends a drag is suppressed so it
 * doesn't also select the dragged item.
 */
export function useDragReorder<DragState extends BaseDragState>() {
  const suppressClickRef = useRef(false);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const updateDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // Window listeners follow the pointer off the item, and keep working while
  // React moves the dragged item's node as the order changes.
  const trackPress = (
    event: PointerEvent<HTMLElement>,
    {
      start,
      move,
      orderForPointer,
      commit,
    }: {
      start: (moveEvent: globalThis.PointerEvent) => DragState;
      move?: (moveEvent: globalThis.PointerEvent, current: DragState) => void;
      orderForPointer: (
        moveEvent: globalThis.PointerEvent,
        current: DragState,
      ) => string[] | null;
      commit: (order: string[]) => void;
    },
  ) => {
    stopTrackingRef.current?.();
    if (event.button !== 0) return;

    const startPoint = { x: event.clientX, y: event.clientY };
    let cancelled = false;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      if (cancelled) return;
      const current = dragRef.current;
      if (!current) {
        const distance = Math.hypot(
          moveEvent.clientX - startPoint.x,
          moveEvent.clientY - startPoint.y,
        );
        if (distance < DRAG_START_PX) return;
        suppressClickRef.current = true;
        document.body.style.cursor = "grabbing";
        updateDrag(start(moveEvent));
        return;
      }

      move?.(moveEvent, current);
      const order = orderForPointer(moveEvent, current);
      if (order) updateDrag({ ...current, order });
    };

    const endDrag = (shouldCommit: boolean) => {
      const current = dragRef.current;
      if (!current) return;
      document.body.style.cursor = "";
      updateDrag(null);
      if (shouldCommit) commit(current.order);
    };

    const onPointerUp = () => {
      endDrag(true);
      stop();
      // The release is followed by its click, so the flag clears after it.
      setTimeout(() => {
        suppressClickRef.current = false;
      });
    };
    const onPointerCancel = () => {
      endDrag(false);
      stop();
      suppressClickRef.current = false;
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape" || !dragRef.current) return;
      cancelled = true;
      endDrag(false);
    };

    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      stopTrackingRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    stopTrackingRef.current = () => {
      endDrag(false);
      stop();
    };
  };

  useEffect(() => () => stopTrackingRef.current?.(), []);

  return { drag, suppressClickRef, trackPress };
}

const DRAG_START_PX = 4;
