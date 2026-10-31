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
} from "react";
import { createPortal } from "react-dom";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/utils";
import { useDragReorder } from "./use-drag-reorder";

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
  const { drag, suppressClickRef, trackPress } = useDragReorder<DragState>();
  // Scopes the sliding underline so two mounted tab bars never trade it.
  const underlineGroupId = useId();
  const reduceMotion = useReducedMotion();

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

  const trackSplitPress = (
    event: PointerEvent<HTMLButtonElement>,
    split: MailSplitTab,
  ) => {
    if (!onReorder || !split.reorderable) return;

    const tab = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    const initialOrder = splits.map(({ id }) => id);
    const reorderableIds = (ids: string[]) =>
      ids.filter((id) => splitsById.get(id)?.reorderable);

    trackPress(event, {
      start: (moveEvent) => {
        const rect = tab.getBoundingClientRect();
        return {
          id: split.id,
          order: initialOrder,
          height: rect.height,
          offsetX: start.x - rect.left,
          offsetY: start.y - rect.top,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        };
      },
      move: (moveEvent, current) => {
        if (!overlayRef.current) return;
        overlayRef.current.style.transform = `translate(${moveEvent.clientX - current.offsetX}px, ${moveEvent.clientY - current.offsetY}px)`;
      },
      orderForPointer: (moveEvent, current) =>
        orderForPointer({
          container: tabsRef.current,
          drag: current,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
          isReorderable: (id) => !!splitsById.get(id)?.reorderable,
        }),
      commit: (order) => {
        const ids = reorderableIds(order);
        if (ids.join() !== reorderableIds(initialOrder).join()) {
          onReorder(ids);
        }
      },
    });
  };

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
                    trackSplitPress(event, split)
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
