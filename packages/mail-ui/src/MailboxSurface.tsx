import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { cx } from "./utils";

export const MAILBOX_PREFETCH_REMAINING = 8;
export const MAILBOX_SCROLL_PADDING_PX = 8;
export const MAILBOX_LOAD_MORE_ROOT_MARGIN = "400px 0px";

export type MailboxThreadListRenderInput<T> = {
  item: T;
  index: number;
  rowKey: string;
  isFocused: boolean;
  isSelected: boolean;
  hasAnySelection: boolean;
  selectionEnabled: boolean;
  rowRef?: Ref<HTMLDivElement>;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
};

export type MailboxThreadListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  getGroupLabel?: (item: T) => string | null;
  renderItem: (input: MailboxThreadListRenderInput<T>) => ReactNode;
  emptyMessage?: ReactNode;
  selectionEnabled?: boolean;
  focusedIndex: number;
  isSelected: (key: string) => boolean;
  selectedCount: number;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
  /** Fires when the list moves off, or back to, its top. */
  onScrolledChange?: (scrolled: boolean) => void;
  showLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  listKey: string;
  className?: string;
  scrollClassName?: string;
  listClassName?: string;
  groupHeaderClassName?: string;
  loadMoreClassName?: string;
  emptyClassName?: string;
  style?: CSSProperties;
  scrollStyle?: CSSProperties;
  listStyle?: CSSProperties;
  loadMoreStyle?: CSSProperties;
  emptyStyle?: CSSProperties;
  loadingMoreIndicator?: ReactNode;
  loadMoreButton?: ReactNode;
  /** The group label that gets no heading, since the newest mail needs none. */
  todayGroupLabel?: string;
  listLabel?: string;
  /** Restores DOM focus to this row key on mount/update, or to the list if absent. */
  restoreFocusKey?: string | null;
  onFocusRestored?: () => void;
};

export function MailboxThreadList<T>({
  items,
  getKey,
  getGroupLabel = () => null,
  todayGroupLabel = "Today",
  listLabel = "Conversations",
  renderItem,
  emptyMessage = "No emails in this view",
  selectionEnabled = true,
  focusedIndex,
  isSelected,
  selectedCount,
  onOpen,
  onToggleSelect,
  onSelectRangeTo,
  onScrolledChange,
  showLoadMore,
  isLoadingMore,
  onLoadMore,
  listKey,
  className = "flex min-h-0 flex-1 flex-col overflow-hidden",
  scrollClassName = "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
  listClassName,
  groupHeaderClassName = "pt-4 pr-5 pb-1.5 font-normal text-muted-foreground text-sm",
  loadMoreClassName = "flex justify-center px-4 py-5",
  emptyClassName = "px-6 py-12 text-center text-muted-foreground text-sm",
  style,
  scrollStyle,
  listStyle,
  loadMoreStyle,
  emptyStyle,
  loadingMoreIndicator = "Loading more",
  loadMoreButton,
  restoreFocusKey = null,
  onFocusRestored,
}: MailboxThreadListProps<T>) {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const focusedRowRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRowRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const prefetchForCount = useRef<number | null>(null);
  const prefetchListKey = useRef(listKey);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const scrolledRef = useRef(false);
  const onScrolledChangeRef = useRef(onScrolledChange);
  onScrolledChangeRef.current = onScrolledChange;
  const onFocusRestoredRef = useRef(onFocusRestored);
  onFocusRestoredRef.current = onFocusRestored;

  const focusedKey = items[focusedIndex]
    ? getKey(items[focusedIndex])
    : undefined;
  const restoreTargetPresent =
    Boolean(restoreFocusKey) &&
    items.some((item) => getKey(item) === restoreFocusKey);
  const groups = useMemo(
    () => groupItemsByLabel(items, getGroupLabel),
    [items, getGroupLabel],
  );

  useLayoutEffect(() => {
    if (!scrollRoot || focusedIndex < 0 || !focusedKey) return;
    const row = focusedRowRef.current;
    if (!row) return;
    scrollElementIntoContainer(scrollRoot, row);
  }, [focusedIndex, focusedKey, scrollRoot]);

  useLayoutEffect(() => {
    if (!restoreFocusKey || !scrollRoot) return;
    let targetRow: HTMLDivElement | null = null;
    if (restoreTargetPresent) {
      targetRow =
        focusedKey === restoreFocusKey
          ? focusedRowRef.current
          : restoreFocusRowRef.current;
    }
    if (targetRow && targetRow !== focusedRowRef.current) {
      scrollElementIntoContainer(scrollRoot, targetRow);
    }
    const target = targetRow ?? listboxRef.current ?? scrollRoot;
    target.focus({ preventScroll: true });
    if (document.activeElement !== target) return;
    onFocusRestoredRef.current?.();
  }, [focusedKey, restoreFocusKey, restoreTargetPresent, scrollRoot]);

  useEffect(() => {
    if (prefetchListKey.current !== listKey) {
      prefetchListKey.current = listKey;
      prefetchForCount.current = null;
    }
    if (
      !shouldPrefetchMoreItems({
        hasMore: showLoadMore,
        isLoadingMore,
        focusedIndex,
        itemCount: items.length,
      })
    ) {
      return;
    }
    if (prefetchForCount.current === items.length) return;
    prefetchForCount.current = items.length;
    onLoadMoreRef.current();
  }, [focusedIndex, isLoadingMore, listKey, showLoadMore, items.length]);

  useEffect(() => {
    if (!showLoadMore || !scrollRoot || items.length === 0) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { root: scrollRoot, rootMargin: MAILBOX_LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRoot, showLoadMore, items.length]);

  useEffect(
    () => () => {
      if (scrolledRef.current) onScrolledChangeRef.current?.(false);
    },
    [],
  );

  return (
    <div className={className} style={style}>
      <div
        className={cx("outline-none", scrollClassName)}
        onScroll={(event) => {
          const scrolled = event.currentTarget.scrollTop > 0;
          if (scrolled === scrolledRef.current) return;
          scrolledRef.current = scrolled;
          onScrolledChangeRef.current?.(scrolled);
        }}
        ref={setScrollRoot}
        style={scrollStyle}
        tabIndex={-1}
      >
        {items.length === 0 && !showLoadMore ? (
          <div className={emptyClassName} style={emptyStyle}>
            {emptyMessage}
          </div>
        ) : (
          <>
            <div
              aria-label={listLabel}
              aria-multiselectable={selectionEnabled || undefined}
              className={cx("outline-none", listClassName)}
              ref={listboxRef}
              role="listbox"
              style={listStyle}
              tabIndex={-1}
            >
              {groups.map((group) => (
                <div
                  aria-label={group.label ?? undefined}
                  key={`${group.label ?? "ungrouped"}-${group.startIndex}`}
                  role="group"
                >
                  {group.label && group.label !== todayGroupLabel ? (
                    <div aria-hidden className={groupHeaderClassName}>
                      {group.label}
                    </div>
                  ) : null}
                  {group.items.map((item, offset) => {
                    const index = group.startIndex + offset;
                    const rowKey = getKey(item);
                    let rowRef: Ref<HTMLDivElement> | undefined;
                    if (index === focusedIndex) {
                      rowRef = focusedRowRef;
                    } else if (restoreFocusKey && rowKey === restoreFocusKey) {
                      rowRef = restoreFocusRowRef;
                    }
                    return renderItem({
                      item,
                      index,
                      rowKey,
                      isFocused: index === focusedIndex,
                      isSelected: selectionEnabled && isSelected(rowKey),
                      hasAnySelection: selectionEnabled && selectedCount > 0,
                      selectionEnabled,
                      rowRef,
                      onOpen,
                      onToggleSelect,
                      onSelectRangeTo,
                    });
                  })}
                </div>
              ))}
            </div>

            {showLoadMore ? (
              <div
                className={loadMoreClassName}
                ref={sentinelRef}
                style={loadMoreStyle}
              >
                {isLoadingMore ? (
                  <div aria-live="polite" role="status">
                    {loadingMoreIndicator}
                  </div>
                ) : (
                  (loadMoreButton ?? (
                    <button onClick={onLoadMore} type="button">
                      Load more
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export type MailReaderPaneProps = {
  selected: boolean;
  children: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
};

export function MailReaderPane({
  selected,
  children,
  empty = "Select an email to read it.",
  loading = false,
  error,
  className,
  style,
  bodyClassName,
  bodyStyle,
}: MailReaderPaneProps) {
  return (
    <section aria-label="Reader" className={className} style={style}>
      {!selected ? (
        <div className={bodyClassName} style={bodyStyle}>
          {empty}
        </div>
      ) : loading ? (
        <div className={bodyClassName} style={bodyStyle}>
          Loading…
        </div>
      ) : error ? (
        <div className={bodyClassName} style={bodyStyle}>
          {error}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function shouldPrefetchMoreItems({
  hasMore,
  isLoadingMore,
  focusedIndex,
  itemCount,
  remainingThreshold = MAILBOX_PREFETCH_REMAINING,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  focusedIndex: number;
  itemCount: number;
  remainingThreshold?: number;
}): boolean {
  if (!hasMore || isLoadingMore || itemCount === 0) return false;
  return focusedIndex >= itemCount - remainingThreshold;
}

export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  padding = MAILBOX_SCROLL_PADDING_PX,
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const topOverflow = containerRect.top + padding - elementRect.top;
  const bottomOverflow = elementRect.bottom - (containerRect.bottom - padding);

  if (topOverflow > 0) {
    container.scrollTop -= topOverflow;
  } else if (bottomOverflow > 0) {
    container.scrollTop += bottomOverflow;
  }
}

function groupItemsByLabel<T>(
  items: T[],
  getGroupLabel: (item: T) => string | null,
) {
  const groups: { label: string | null; startIndex: number; items: T[] }[] = [];

  items.forEach((item, index) => {
    const label = getGroupLabel(item);
    const openGroup = groups.at(-1);
    if (openGroup?.label === label) openGroup.items.push(item);
    else groups.push({ label, startIndex: index, items: [item] });
  });

  return groups;
}
