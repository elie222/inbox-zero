export const THREAD_PREFETCH_REMAINING = 8;
export const THREAD_SCROLL_PADDING_PX = 8;
export const THREAD_LOAD_MORE_ROOT_MARGIN = "400px 0px";

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
