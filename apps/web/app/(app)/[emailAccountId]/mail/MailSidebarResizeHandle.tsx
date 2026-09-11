"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clampMailSidebarWidth,
  MAIL_SIDEBAR_DEFAULT_WIDTH,
  MAIL_SIDEBAR_MAX_WIDTH,
  MAIL_SIDEBAR_MIN_WIDTH,
  persistMailSidebarWidth,
} from "@/app/(app)/[emailAccountId]/mail/sidebar-width";

const KEYBOARD_STEP = 16;

/**
 * Drag strip on the sidebar's trailing edge. The applied `--sidebar-width` is
 * the source of truth throughout — reading the sidebar's box instead would
 * report a half-finished value while its collapse transition is still running.
 */
export function MailSidebarResizeHandle({
  onResize,
}: {
  onResize: (width: number) => void;
}) {
  // Mirrored into state purely so the separator can expose its value; the ref
  // is what unmount cleanup can still read.
  const [width, setWidth] = useState(MAIL_SIDEBAR_DEFAULT_WIDTH);
  const latestWidth = useRef(MAIL_SIDEBAR_DEFAULT_WIDTH);
  const panelLeftWhileDragging = useRef<number | null>(null);

  const measure = useCallback((handle: HTMLDivElement | null) => {
    if (!handle) return;
    latestWidth.current = appliedWidth(handle);
    setWidth(latestWidth.current);
  }, []);

  // Collapsing the sidebar mid-drag unmounts the handle before it can release
  // the pointer, so finish the drag here rather than stranding the page in a
  // resizing state and losing the width the user just dragged to.
  useEffect(
    () => () => {
      releaseResizingCursor();
      if (panelLeftWhileDragging.current === null) return;
      persistMailSidebarWidth(latestWidth.current);
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
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={MAIL_SIDEBAR_MIN_WIDTH}
      aria-valuemax={MAIL_SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        // A right-click opens the context menu; it shouldn't drag the edge too.
        if (event.button !== 0) return;
        const panel = event.currentTarget.parentElement;
        if (!panel) return;
        event.preventDefault();
        panelLeftWhileDragging.current = panel.getBoundingClientRect().left;
        event.currentTarget.setPointerCapture(event.pointerId);
        // Holds the resize cursor and suppresses width transitions for the
        // duration of the drag, so the edge tracks the pointer exactly.
        document.body.dataset.resizing = "true";
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        const panelLeft = panelLeftWhileDragging.current;
        if (panelLeft === null) return;
        resize(clampMailSidebarWidth(event.clientX - panelLeft));
      }}
      onLostPointerCapture={(event: PointerEvent<HTMLDivElement>) => {
        if (panelLeftWhileDragging.current === null) return;
        panelLeftWhileDragging.current = null;
        releaseResizingCursor();
        persistMailSidebarWidth(appliedWidth(event.currentTarget));
      }}
      onDoubleClick={() => {
        resize(MAIL_SIDEBAR_DEFAULT_WIDTH);
        persistMailSidebarWidth(MAIL_SIDEBAR_DEFAULT_WIDTH);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const step = event.key === "ArrowLeft" ? -KEYBOARD_STEP : KEYBOARD_STEP;
        const next = clampMailSidebarWidth(
          appliedWidth(event.currentTarget) + step,
        );
        resize(next);
        persistMailSidebarWidth(next);
      }}
      className="absolute inset-y-0 right-0 z-20 hidden w-2 translate-x-1/2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-primary focus-visible:after:bg-primary focus-visible:outline-none md:block"
    />
  );
}

function releaseResizingCursor() {
  delete document.body.dataset.resizing;
}

function appliedWidth(handle: HTMLElement): number {
  return clampMailSidebarWidth(
    Number.parseInt(
      getComputedStyle(handle).getPropertyValue("--sidebar-width"),
      10,
    ),
  );
}
