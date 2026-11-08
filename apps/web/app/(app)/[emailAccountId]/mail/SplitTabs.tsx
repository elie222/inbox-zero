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
  ContextMenuCheckboxItem,
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
  /** Collapsed into one row in the inbox when bundling is on. */
  bundleInInbox?: boolean;
  /** Whether this split can be bundled at all; see `isBundleEligibleSplit`. */
  bundleEligible?: boolean;
};

export type SplitTabsProps = {
  splits: MailSplitTab[];
  activeSplitId: string | null;
  /** Conversations currently in each split. Missing entries and zeros stay blank. */
  countsById?: ReadonlyMap<string, number>;
  onSelect: (splitId: string) => void;
  onDelete: (splitId: string) => void;
  onEdit?: (splitId: string) => void;
  /** Offered only while inbox bundling is on. */
  onToggleBundle?: (splitId: string, bundleInInbox: boolean) => void;
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
  onToggleBundle,
  onReorder,
  onNewSplit,
  canCreateSplits,
  leading,
  className,
}: SplitTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { drag, suppressClickRef, trackPress } = useDragReorder<DragState>();
  // Scopes the sliding underline so two mounted tab bars never trade it.
  const underlineGroupId = useId();
  const reduceMotion = useReducedMotion();
  const [hidden, setHidden] = useState({ start: false, end: false });

  const splitsById = useMemo(
    () => new Map(splits.map((split) => [split.id, split])),
    [splits],
  );
  const orderedSplits = drag
    ? drag.order.flatMap((id) => splitsById.get(id) ?? [])
    : splits;
  // The saved order, so a reorder that moves the active tab keeps it in view.
  const splitOrder = splits.map((split) => split.id).join();
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

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const update = () => {
      const start = tabs.scrollLeft > 1;
      const end = tabs.scrollLeft < tabs.scrollWidth - tabs.clientWidth - 1;
      setHidden((current) =>
        current.start === start && current.end === end
          ? current
          : { start, end },
      );
    };
    update();
    tabs.addEventListener("scroll", update, { passive: true });
    // A layout switch resizes the visible strip, so bring the active tab back.
    // The track also grows when a count changes width; that only moves the
    // fades, so it doesn't undo where the reader has scrolled to.
    const observer = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.target === tabs))
        revealActiveTab(tabs, "instant");
      update();
    });
    observer.observe(tabs);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => {
      tabs.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!activeSplitId || !tabs || !splitOrder) return;
    revealActiveTab(tabs, reduceMotion ? "instant" : "smooth");
  }, [activeSplitId, splitOrder, reduceMotion]);

  return (
    <div
      className={cn(
        // Padded to sit under the toolbar's search field rather than against
        // the column edge. The rule stays transparent unless the caller shows
        // it, so the active tab's underline carries the edge on its own.
        "flex items-center gap-5 border-transparent border-b px-3 transition-colors",
        className,
      )}
    >
      {leading ? <span className="mr-1.5 flex shrink-0">{leading}</span> : null}
      {/* Reaches 1px over the rule so the underline isn't clipped by the scroller. */}
      <div
        ref={tabsRef}
        className="relative -mb-px min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: edgeFadeMask(hidden) }}
      >
        <div ref={trackRef} className="flex w-max items-center gap-5">
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
                        "relative flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap py-2 text-sm focus-visible:outline-none",
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
                            reduceMotion
                              ? { duration: 0 }
                              : UNDERLINE_TRANSITION
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
                    {onToggleBundle && split.bundleEligible && (
                      <ContextMenuCheckboxItem
                        checked={!!split.bundleInInbox}
                        onCheckedChange={(checked) =>
                          onToggleBundle(split.id, checked)
                        }
                      >
                        Bundle in Inbox
                      </ContextMenuCheckboxItem>
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
        </div>
      </div>

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
const EDGE_FADE_PX = 32;

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
  // Tab offsets are measured along the scrolled track, not the visible strip.
  const pointerX = x - origin.left + container.scrollLeft;
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

/** Scrolls only the strip, unlike scrollIntoView, and clears the edge fade. */
function revealActiveTab(tabs: HTMLElement, behavior: ScrollBehavior) {
  const tab = tabs.querySelector<HTMLElement>(
    '[data-split-tab][aria-current="true"]',
  );
  if (!tab || tabs.clientWidth === 0) return;
  const start = tab.offsetLeft - EDGE_FADE_PX;
  const end =
    tab.offsetLeft + tab.offsetWidth + EDGE_FADE_PX - tabs.clientWidth;
  if (tabs.scrollLeft > start) {
    tabs.scrollTo({ left: Math.max(0, start), behavior });
  } else if (tabs.scrollLeft < end) {
    tabs.scrollTo({ left: end, behavior });
  }
}

function edgeFadeMask(hidden: { start: boolean; end: boolean }) {
  if (!hidden.start && !hidden.end) return;
  const start = hidden.start ? "transparent" : "#000";
  const end = hidden.end ? "transparent" : "#000";
  return `linear-gradient(to right, ${start}, #000 ${EDGE_FADE_PX}px, #000 calc(100% - ${EDGE_FADE_PX}px), ${end})`;
}
