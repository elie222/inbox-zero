"use client";

import { PlusIcon } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/utils";

export type MailSplitTab = {
  id: string;
  name: string;
  /** Built-in splits (e.g. All) can't be edited or removed. */
  deletable: boolean;
  /** Saved splits can be dragged into a new position; synthetic ones stay put. */
  reorderable?: boolean;
};

export type SplitTabsProps = {
  splits: MailSplitTab[];
  activeSplitId: string | null;
  /** Conversations currently in each split. Missing entries and zeros stay blank. */
  countsById?: ReadonlyMap<string, number>;
  onSelect: (splitId: string) => void;
  onDelete: (splitId: string) => void;
  onEdit?: (splitId: string) => void;
  /** Receives every reorderable split id in its new order. */
  onReorder?: (ids: string[]) => void;
  onNewSplit: () => void;
  /** Split creation stays account-scoped, so it is hidden in All accounts. */
  canCreateSplits: boolean;
  /** Sits before the tabs, lined up with the row checkboxes below. */
  leading?: ReactNode;
  className?: string;
};

export function SplitTabs({
  splits,
  activeSplitId,
  countsById,
  onSelect,
  onDelete,
  onEdit,
  onReorder,
  onNewSplit,
  canCreateSplits,
  leading,
  className,
}: SplitTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const holdRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  // The click that ends a drag would otherwise also open the dragged split.
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(
    null,
  );

  const splitsById = useMemo(
    () => new Map(splits.map((split) => [split.id, split])),
    [splits],
  );
  const orderedSplits = drag
    ? drag.order.flatMap((id) => splitsById.get(id) ?? [])
    : splits;

  const cancelHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current.timer);
    holdRef.current = null;
  };

  const startHold = (
    event: PointerEvent<HTMLButtonElement>,
    split: MailSplitTab,
  ) => {
    cancelHold();
    if (!onReorder || !split.reorderable || event.button !== 0) return;
    holdRef.current = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        holdRef.current = null;
        setDrag({ id: split.id, order: splits.map(({ id }) => id) });
      }, LONG_PRESS_MS),
    };
  };

  // Moving the pointer before the hold completes is a normal click or a
  // text selection, not a drag.
  const moveDuringHold = (event: PointerEvent<HTMLButtonElement>) => {
    const hold = holdRef.current;
    if (
      hold &&
      Math.hypot(event.clientX - hold.x, event.clientY - hold.y) >
        HOLD_MOVE_TOLERANCE_PX
    ) {
      cancelHold();
    }
  };

  // Tracked on the window because React moves the dragged tab's DOM node as
  // the order changes, which would drop pointer capture on the tab itself.
  useEffect(() => {
    if (!drag) return;

    const reorderableIds = (ids: string[]) =>
      ids.filter((id) => splitsById.get(id)?.reorderable);

    const finish = (commit: boolean) => {
      suppressClickRef.current = true;
      setDrag(null);
      const ids = reorderableIds(drag.order);
      const unchanged =
        ids.join() === reorderableIds(splits.map(({ id }) => id)).join();
      if (commit && !unchanged) onReorder?.(ids);
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-split-tab]");
      const targetId = target?.dataset.splitTab;
      if (!target || !targetId || targetId === drag.id) return;
      if (!splitsById.get(targetId)?.reorderable) return;

      // Placing by the target's midpoint, rather than swapping on entry, keeps
      // tabs of different widths from swapping back under a still pointer.
      const { left, width } = target.getBoundingClientRect();
      const after = event.clientX > left + width / 2;
      const order = drag.order.filter((id) => id !== drag.id);
      order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, drag.id);
      if (order.join() === drag.order.join()) return;
      setDrag({ id: drag.id, order });
    };
    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drag, splits, splitsById, onReorder]);

  useEffect(() => {
    // The release that ends the gesture is followed by its click, so the flag
    // clears just after it, including when Esc cancelled the drag earlier.
    const clearSuppressedClick = () => {
      setTimeout(() => {
        suppressClickRef.current = false;
      });
    };
    window.addEventListener("pointerup", clearSuppressedClick);
    return () => {
      window.removeEventListener("pointerup", clearSuppressedClick);
      if (holdRef.current) clearTimeout(holdRef.current.timer);
    };
  }, []);

  useEffect(() => {
    const tabs = tabsRef.current;
    const focusedTab = document.activeElement;
    if (
      !activeSplitId ||
      !(focusedTab instanceof HTMLButtonElement) ||
      !tabs?.contains(focusedTab) ||
      !focusedTab.hasAttribute("data-split-tab")
    ) {
      return;
    }

    activeTabRef.current?.focus({ preventScroll: true });
  }, [activeSplitId]);

  return (
    <div
      ref={tabsRef}
      className={cn(
        // Padded to sit under the toolbar's search field rather than against
        // the column edge, and ruled off so the tabs read as a header for the
        // list instead of crowding the first row.
        "flex flex-wrap items-center gap-1 border-border border-b px-3 pb-2",
        className,
      )}
    >
      {leading ? <span className="mr-1.5 flex">{leading}</span> : null}
      {orderedSplits.map((split) => {
        const active = split.id === activeSplitId;
        const dragging = drag?.id === split.id;
        const countLabel = splitCountLabel(countsById?.get(split.id));

        return (
          <ContextMenu key={split.id}>
            <ContextMenuTrigger asChild disabled={!split.deletable}>
              <button
                type="button"
                ref={active ? activeTabRef : undefined}
                data-split-tab={split.id}
                onClick={() => {
                  if (!suppressClickRef.current) onSelect(split.id);
                }}
                onPointerDown={(event) => startHold(event, split)}
                onPointerMove={moveDuringHold}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                // The count sits in this button, so innerText includes it.
                // The accessible name stays the split itself.
                aria-label={split.name}
                aria-current={active ? "true" : undefined}
                aria-description={
                  countLabel ? `${countLabel} in this view` : undefined
                }
                className={cn(
                  "flex select-none items-center gap-1 rounded-full py-0.5 pr-2 pl-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  dragging && "cursor-grabbing ring-1 ring-border",
                )}
              >
                <span data-split-name>{split.name}</span>
                {countLabel ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "font-normal tabular-nums",
                      active ? "text-primary/70" : "opacity-70",
                    )}
                  >
                    {countLabel}
                  </span>
                ) : null}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-44">
              {onEdit && (
                <ContextMenuItem onSelect={() => onEdit(split.id)}>
                  Edit filters and name
                </ContextMenuItem>
              )}
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(split.id)}
              >
                Turn off split
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      {canCreateSplits && (
        <button
          type="button"
          aria-label="New split"
          onClick={onNewSplit}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const LONG_PRESS_MS = 300;
const HOLD_MOVE_TOLERANCE_PX = 5;

function splitCountLabel(count: number | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return count.toLocaleString("en-US");
}
