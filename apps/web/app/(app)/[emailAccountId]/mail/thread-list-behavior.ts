export const THREAD_PREFETCH_REMAINING = 8;
export const THREAD_SCROLL_PADDING_PX = 8;
export const THREAD_LOAD_MORE_ROOT_MARGIN = "400px 0px";

export function getActiveThreadIndex({
  threadIds,
  focusedIndex,
  openThreadId,
}: {
  threadIds: string[];
  focusedIndex: number;
  openThreadId: string | null;
}): number {
  const clampedFocusedIndex = Math.min(
    Math.max(0, focusedIndex),
    Math.max(0, threadIds.length - 1),
  );
  if (!openThreadId) return clampedFocusedIndex;

  const openThreadIndex = threadIds.indexOf(openThreadId);
  return openThreadIndex >= 0 ? openThreadIndex : clampedFocusedIndex;
}

export function getNextThreadIdAfterRemoval({
  threadIds,
  currentThreadId,
  removedThreadIds,
}: {
  threadIds: string[];
  currentThreadId: string;
  removedThreadIds: string[];
}): string | null {
  const currentIndex = threadIds.indexOf(currentThreadId);
  if (currentIndex < 0) return null;

  const removed = new Set(removedThreadIds);
  for (let index = currentIndex + 1; index < threadIds.length; index++) {
    const threadId = threadIds[index];
    if (threadId && !removed.has(threadId)) return threadId;
  }
  for (let index = currentIndex - 1; index >= 0; index--) {
    const threadId = threadIds[index];
    if (threadId && !removed.has(threadId)) return threadId;
  }
  return null;
}

export function shouldPrefetchMoreThreads({
  hasMore,
  isLoadingMore,
  focusedIndex,
  threadCount,
  remainingThreshold = THREAD_PREFETCH_REMAINING,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  focusedIndex: number;
  threadCount: number;
  remainingThreshold?: number;
}): boolean {
  if (!hasMore || isLoadingMore || threadCount === 0) return false;
  return focusedIndex >= threadCount - remainingThreshold;
}

export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  padding = THREAD_SCROLL_PADDING_PX,
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
