"use client";

import { useCallback, useRef } from "react";
import {
  MAIL_LIST_WIDTH_BOUNDS,
  MAIL_LIST_WIDTH_COOKIE,
} from "@/app/(app)/[emailAccountId]/mail/panel-widths";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { persistPanelWidth } from "@/utils/panel-width";

const DEFAULT_WIDTH = "clamp(258px, 32vw, 400px)";
const READER_MIN_WIDTH = "360px";

export function MailListPanel({
  layout,
  children,
}: {
  layout: MailLayoutMode;
  children: React.ReactNode;
}) {
  // Dragging writes straight to the CSS variable: re-rendering MailShell on
  // every pointer move would make the edge lag behind the cursor.
  const panelRef = useRef<HTMLElement>(null);
  const setListWidth = useCallback((width: string) => {
    panelRef.current?.style.setProperty("--mail-list-width", width);
  }, []);
  const onResize = useCallback(
    (width: number) => setListWidth(`${width}px`),
    [setListWidth],
  );
  const onReset = useCallback(() => {
    setListWidth(DEFAULT_WIDTH);
    persistPanelWidth(MAIL_LIST_WIDTH_COOKIE, null);
  }, [setListWidth]);

  if (layout !== "split") {
    return (
      // min-w-0 matters: a flex item won't shrink below its content width
      // without it, so long snippets would widen the column past the viewport
      // instead of truncating.
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </section>
    );
  }

  return (
    <section
      ref={panelRef}
      className="relative flex min-h-0 shrink-0 flex-col border-r border-border"
      style={{
        // The reader keeps a usable width however wide the list was dragged or
        // however narrow the window gets afterwards, until the window is too
        // narrow for both and the list holds its minimum as before.
        width: `max(${MAIL_LIST_WIDTH_BOUNDS.min}px, min(var(--mail-list-width, ${DEFAULT_WIDTH}), calc(100% - ${READER_MIN_WIDTH})))`,
      }}
    >
      {children}
      <PanelResizeHandle
        label="Resize email list"
        edge="right"
        bounds={MAIL_LIST_WIDTH_BOUNDS}
        onResize={onResize}
        onResizeEnd={persistListWidth}
        onReset={onReset}
      />
    </section>
  );
}

function persistListWidth(width: number) {
  persistPanelWidth(MAIL_LIST_WIDTH_COOKIE, width);
}
