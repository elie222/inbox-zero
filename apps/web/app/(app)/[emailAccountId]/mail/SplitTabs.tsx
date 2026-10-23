"use client";

import { GripVerticalIcon, PlusIcon } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  const overlayRef = useRef<HTMLDivElement>(null);
  // The click that ends a drag would otherwise also open the dragged split.
  const suppressClickRef = useRef(false);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Scopes the sliding underline so two mounted tab bars never trade it.
  const underlineGroupId = useId();
  const reduceMotion = useReducedMotion();
  const dragRef = useRef<DragState | null>(null);
  const updateDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const splitsById = useMemo(
    () => new Map(splits.map((split) => [split.id, split])),
    [splits],
  );
  const orderedSplits = drag
    ? drag.order.flatMap((id) => splitsById.get(id) ?? [])
    : splits;
  const draggedSplit = drag ? splitsById.get(drag.id) : undefined;
  const draggedCountLabel = draggedSplit
    ? splitCountLabel(countsById?.get(draggedSplit.id))
    : null;

  // Window listeners follow the pointer off the tab, and keep working while
  // React moves the dragged tab's node as the order changes.
  const trackPress = (
    event: PointerEvent<HTMLButtonElement>,
    split: MailSplitTab,
  ) => {
    stopTrackingRef.current?.();
    if (!onReorder || !split.reorderable || event.button !== 0) return;

    const tab = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    let cancelled = false;
    const initialOrder = splits.map(({ id }) => id);
    const reorderableIds = (ids: string[]) =>
      ids.filter((id) => splitsById.get(id)?.reorderable);

    const moveOverlay = (x: number, y: number) => {
      const current = dragRef.current;
      if (!overlayRef.current || !current) return;
      overlayRef.current.style.transform = `translate(${x - current.offsetX}px, ${y - current.offsetY}px)`;
    };

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      if (cancelled) return;
      const current = dragRef.current;
      if (!current) {
        const distance = Math.hypot(
          moveEvent.clientX - start.x,
          moveEvent.clientY - start.y,
        );
        if (distance < DRAG_START_PX) return;
        const rect = tab.getBoundingClientRect();
        suppressClickRef.current = true;
        document.body.style.cursor = "grabbing";
        updateDrag({
          id: split.id,
          order: initialOrder,
          height: rect.height,
          offsetX: start.x - rect.left,
          offsetY: start.y - rect.top,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });
        return;
      }

      moveOverlay(moveEvent.clientX, moveEvent.clientY);
      const order = orderForPointer({
        container: tabsRef.current,
        drag: current,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        isReorderable: (id) => !!splitsById.get(id)?.reorderable,
      });
      if (order) updateDrag({ ...current, order });
    };

    const endDrag = (commit: boolean) => {
      const current = dragRef.current;
      if (!current) return;
      document.body.style.cursor = "";
      updateDrag(null);
      const ids = reorderableIds(current.order);
      if (commit && ids.join() !== reorderableIds(initialOrder).join()) {
        onReorder(ids);
      }
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

    tabs
      .querySelector<HTMLButtonElement>('[data-split-tab][aria-current="true"]')
      ?.focus({ preventScroll: true });
  }, [activeSplitId]);

  return (
    <div
      ref={tabsRef}
      className={cn(
        // Padded to sit under the toolbar's search field rather than against
        // the column edge. The rule stays transparent unless the caller shows
        // it, so the active tab's underline carries the edge on its own.
        "relative flex flex-wrap items-center gap-5 border-transparent border-b px-3 transition-colors",
        className,
      )}
    >
      {leading ? <span className="mr-1.5 flex">{leading}</span> : null}
      <LayoutGroup id={underlineGroupId}>
        {orderedSplits.map((split) => {
          const active = split.id === activeSplitId;
          const dragging = drag?.id === split.id;
          const countLabel = splitCountLabel(countsById?.get(split.id));

          return (
            <ContextMenu key={split.id}>
              <ContextMenuTrigger asChild disabled={!split.deletable}>
                <motion.button
                  type="button"
                  layout={drag ? "position" : false}
                  transition={TAB_MOVE_TRANSITION}
                  data-split-tab={split.id}
                  onClick={() => {
                    if (!suppressClickRef.current) onSelect(split.id);
                  }}
                  onPointerDown={(event: PointerEvent<HTMLButtonElement>) =>
                    trackPress(event, split)
                  }
                  // The count sits in this button, so innerText includes it.
                  // The accessible name stays the split itself.
                  aria-label={split.name}
                  aria-current={active ? "true" : undefined}
                  aria-description={
                    countLabel ? `${countLabel} in this view` : undefined
                  }
                  className={cn(
                    "relative flex select-none items-center gap-1.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                    dragging && "opacity-40",
                  )}
                >
                  <span data-split-name>{split.name}</span>
                  {countLabel ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "font-normal text-muted-foreground tabular-nums",
                        !active && "opacity-70",
                      )}
                    >
                      {countLabel}
                    </span>
                  ) : null}
                  {active ? (
                    <motion.span
                      aria-hidden="true"
                      layoutId="split-tab-underline"
                      transition={
                        reduceMotion ? { duration: 0 } : UNDERLINE_TRANSITION
                      }
                      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                    />
                  ) : null}
                </motion.button>
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
      </LayoutGroup>

      {drag && draggedSplit
        ? createPortal(
            <div
              ref={overlayRef}
              aria-hidden="true"
              className="pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-1 rounded-full bg-background py-0.5 pr-2 pl-1 text-foreground text-xs shadow-lg ring-1 ring-border"
              style={{
                height: drag.height,
                transform: `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`,
              }}
            >
              <GripVerticalIcon className="size-3 opacity-60" />
              <span>{draggedSplit.name}</span>
              {draggedCountLabel ? (
                <span className="font-normal tabular-nums opacity-70">
                  {draggedCountLabel}
                </span>
              ) : null}
            </div>,
            document.body,
          )
        : null}

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

type DragState = {
  id: string;
  order: string[];
  height: number;
  /** Where the tab was grabbed, so it stays under the pointer at that spot. */
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
};

const DRAG_START_PX = 4;
const TAB_MOVE_TRANSITION = { duration: 0.15, ease: "easeOut" } as const;
const UNDERLINE_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;

/**
 * The order with the dragged tab placed before or after the tab under the
 * pointer, by which half of it the pointer is in. Reads layout boxes rather
 * than on-screen rects, so tabs still sliding into place don't cause swaps.
 */
function orderForPointer({
  container,
  drag,
  x,
  y,
  isReorderable,
}: {
  container: HTMLElement | null;
  drag: DragState;
  x: number;
  y: number;
  isReorderable: (id: string) => boolean;
}): string[] | null {
  if (!container) return null;
  const origin = container.getBoundingClientRect();
  const pointerX = x - origin.left;
  const pointerY = y - origin.top;

  for (const tab of container.querySelectorAll<HTMLElement>(
    "[data-split-tab]",
  )) {
    const targetId = tab.dataset.splitTab;
    if (!targetId || targetId === drag.id || !isReorderable(targetId)) continue;
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = tab;
    if (
      pointerX < offsetLeft ||
      pointerX > offsetLeft + offsetWidth ||
      pointerY < offsetTop ||
      pointerY > offsetTop + offsetHeight
    ) {
      continue;
    }

    const after = pointerX > offsetLeft + offsetWidth / 2;
    const order = drag.order.filter((id) => id !== drag.id);
    order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, drag.id);
    return order.join() === drag.order.join() ? null : order;
  }
  return null;
}

function splitCountLabel(count: number | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return count.toLocaleString("en-US");
}
