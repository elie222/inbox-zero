"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils";
import { clampPanelWidth, type PanelWidthBounds } from "@/utils/panel-width";

const KEYBOARD_STEP = 16;

/**
 * Drag strip on one edge of the panel it's positioned against. Widths are
 * measured from that panel's box rather than tracked here, so a CSS cap on the
 * panel (for example to leave room for its neighbours) is what gets reported
 * and saved.
 */
export function PanelResizeHandle({
  label,
  edge,
  bounds,
  onResize,
  onResizeEnd,
  onReset,
}: {
  label: string;
  /** Which edge of the panel the handle sits on. */
  edge: "left" | "right";
  bounds: PanelWidthBounds;
  /** Called on every drag step, so it should write the width straight to the DOM. */
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onReset: () => void;
}) {
  // Mirrored into state purely so the separator can expose its value; the ref
  // is what unmount cleanup can still read.
  const [width, setWidth] = useState<number>();
  const latestWidth = useRef<number | null>(null);
  const anchorWhileDragging = useRef<number | null>(null);
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;

  const measure = useCallback(
    (handle: HTMLDivElement | null) => {
      if (!handle) return;
      latestWidth.current = panelWidth(handle, bounds);
      setWidth(latestWidth.current);
    },
    [bounds],
  );

  // Closing the panel mid-drag unmounts the handle before it can release the
  // pointer, so finish the drag here rather than stranding the page in a
  // resizing state and losing the width the user just dragged to.
  useEffect(
    () => () => {
      releaseResizingCursor();
      if (anchorWhileDragging.current === null) return;
      if (latestWidth.current !== null)
        onResizeEndRef.current(latestWidth.current);
    },
    [],
  );

  const resize = (next: number) => {
    latestWidth.current = next;
    setWidth(next);
    onResize(next);
  };

  return (
    <div
      ref={measure}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        // A right-click opens the context menu; it shouldn't drag the edge too.
        if (event.button !== 0) return;
        const panel = event.currentTarget.offsetParent;
        if (!panel) return;
        event.preventDefault();
        // The panel's opposite edge stays put while this one follows the pointer.
        const rect = panel.getBoundingClientRect();
        anchorWhileDragging.current = edge === "right" ? rect.left : rect.right;
        event.currentTarget.setPointerCapture(event.pointerId);
        // Holds the resize cursor and suppresses width transitions for the
        // duration of the drag, so the edge tracks the pointer exactly.
        document.body.dataset.resizing = "true";
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        const anchor = anchorWhileDragging.current;
        if (anchor === null) return;
        const next = clampPanelWidth(
          edge === "right" ? event.clientX - anchor : anchor - event.clientX,
          bounds,
        );
        if (next !== null) resize(next);
      }}
      onLostPointerCapture={(event: PointerEvent<HTMLDivElement>) => {
        if (anchorWhileDragging.current === null) return;
        anchorWhileDragging.current = null;
        releaseResizingCursor();
        const applied = panelWidth(event.currentTarget, bounds);
        latestWidth.current = applied;
        setWidth(applied);
        onResizeEnd(applied);
      }}
      onDoubleClick={() => {
        onReset();
        // The default may still be easing in, so it's measured on next use.
        latestWidth.current = null;
        setWidth(undefined);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const towardsEdge = (event.key === "ArrowRight") === (edge === "right");
        const next = clampPanelWidth(
          panelWidth(event.currentTarget, bounds) +
            (towardsEdge ? KEYBOARD_STEP : -KEYBOARD_STEP),
          bounds,
        );
        if (next === null) return;
        // Applied without easing so the box can be read straight back: a CSS
        // cap on the panel may have held it narrower than requested, and
        // that's the width to save.
        document.body.dataset.resizing = "true";
        resize(next);
        const applied = panelWidth(event.currentTarget, bounds);
        releaseResizingCursor();
        latestWidth.current = applied;
        setWidth(applied);
        onResizeEnd(applied);
      }}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 focus-visible:after:bg-primary focus-visible:outline-none lg:block",
        edge === "right"
          ? "right-0 translate-x-1/2"
          : "left-0 -translate-x-1/2",
      )}
    />
  );
}

function releaseResizingCursor() {
  delete document.body.dataset.resizing;
}

function panelWidth(handle: HTMLElement, bounds: PanelWidthBounds): number {
  const width =
    handle.offsetParent?.getBoundingClientRect().width ?? Number.NaN;
  return clampPanelWidth(width, bounds) ?? bounds.min;
}
