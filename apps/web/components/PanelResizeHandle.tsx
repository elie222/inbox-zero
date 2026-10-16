"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils";
import {
  clampPanelWidth,
  type PanelWidthConfig,
  persistPanelWidth,
} from "@/utils/panel-width";

const KEYBOARD_STEP = 16;

/**
 * Drag strip on one edge of a panel; it must be a direct child of the panel.
 * `edge` is the side it sits on: "end" for a panel that grows rightwards,
 * "start" for one anchored to the right of the screen.
 *
 * The applied CSS variable is the source of truth throughout — reading the
 * panel's box instead would report a half-finished value while a width
 * transition is still running.
 */
export function PanelResizeHandle({
  config,
  edge,
  label,
  onResize,
  className,
}: {
  config: PanelWidthConfig;
  edge: "start" | "end";
  label: string;
  onResize: (width: number) => void;
  className?: string;
}) {
  // Mirrored into state purely so the separator can expose its value; the ref
  // is what unmount cleanup can still read.
  const [width, setWidth] = useState(config.defaultWidth);
  const latestWidth = useRef(config.defaultWidth);
  const anchorWhileDragging = useRef<number | null>(null);

  const measure = useCallback(
    (handle: HTMLDivElement | null) => {
      if (!handle) return;
      latestWidth.current = appliedWidth(config, handle);
      setWidth(latestWidth.current);
    },
    [config],
  );

  // Closing the panel mid-drag unmounts the handle before it can release the
  // pointer, so finish the drag here rather than stranding the page in a
  // resizing state and losing the width the user just dragged to.
  useEffect(
    () => () => {
      releaseResizingCursor();
      if (anchorWhileDragging.current === null) return;
      persistPanelWidth(config, latestWidth.current);
    },
    [config],
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
      aria-valuemin={config.minWidth}
      aria-valuemax={config.maxWidth}
      tabIndex={0}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        // A right-click opens the context menu; it shouldn't drag the edge too.
        if (event.button !== 0) return;
        const panel = event.currentTarget.parentElement;
        if (!panel) return;
        event.preventDefault();
        // The panel's fixed edge: the opposite side from the handle.
        const rect = panel.getBoundingClientRect();
        anchorWhileDragging.current = edge === "end" ? rect.left : rect.right;
        event.currentTarget.setPointerCapture(event.pointerId);
        // Holds the resize cursor and suppresses width transitions for the
        // duration of the drag, so the edge tracks the pointer exactly.
        document.body.dataset.resizing = "true";
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        const anchor = anchorWhileDragging.current;
        if (anchor === null) return;
        const next =
          edge === "end" ? event.clientX - anchor : anchor - event.clientX;
        resize(clampPanelWidth(config, next));
      }}
      onLostPointerCapture={(event: PointerEvent<HTMLDivElement>) => {
        if (anchorWhileDragging.current === null) return;
        anchorWhileDragging.current = null;
        releaseResizingCursor();
        persistPanelWidth(config, appliedWidth(config, event.currentTarget));
      }}
      onDoubleClick={() => {
        resize(config.defaultWidth);
        persistPanelWidth(config, config.defaultWidth);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        // The arrow pointing away from the panel widens it.
        const direction =
          (event.key === "ArrowRight") === (edge === "end") ? 1 : -1;
        const next = clampPanelWidth(
          config,
          appliedWidth(config, event.currentTarget) + direction * KEYBOARD_STEP,
        );
        resize(next);
        persistPanelWidth(config, next);
      }}
      className={cn(
        "absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-primary focus-visible:after:bg-primary focus-visible:outline-none",
        edge === "end" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
        className,
      )}
    />
  );
}

function releaseResizingCursor() {
  delete document.body.dataset.resizing;
}

function appliedWidth(config: PanelWidthConfig, handle: HTMLElement): number {
  return clampPanelWidth(
    config,
    Number.parseInt(
      getComputedStyle(handle).getPropertyValue(config.cssVar),
      10,
    ),
  );
}
