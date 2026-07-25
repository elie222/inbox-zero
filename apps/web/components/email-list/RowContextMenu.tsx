"use client";

import { useEffect } from "react";

export type RowMenuItem = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
};

// A lightweight right-click menu: fixed overlay that closes on any click
// or Escape, with the menu clamped inside the viewport.
export function RowContextMenu({
  position,
  items,
  onClose,
}: {
  position: { x: number; y: number };
  items: RowMenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const menuHeight = items.length * 36 + 8;
  const top = Math.max(
    8,
    Math.min(position.y, window.innerHeight - menuHeight - 8),
  );
  const left = Math.max(8, Math.min(position.x, window.innerWidth - 248));

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes via the document listener above
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        style={{ top, left }}
        className="fixed z-50 min-w-60 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
              item.onClick();
            }}
          >
            {item.icon && (
              <item.icon className="size-4 shrink-0 text-muted-foreground" />
            )}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
