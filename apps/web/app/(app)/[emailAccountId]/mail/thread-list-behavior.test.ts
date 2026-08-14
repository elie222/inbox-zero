import { describe, expect, it } from "vitest";
import {
  scrollElementIntoContainer,
  shouldPrefetchMoreThreads,
  THREAD_PREFETCH_REMAINING,
} from "./thread-list-behavior";

describe("shouldPrefetchMoreThreads", () => {
  it("does not prefetch when there is no next page", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: false,
        isLoadingMore: false,
        focusedIndex: 49,
        threadCount: 50,
      }),
    ).toBe(false);
  });

  it("does not prefetch while a page is already loading", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: true,
        isLoadingMore: true,
        focusedIndex: 49,
        threadCount: 50,
      }),
    ).toBe(false);
  });

  it("does not prefetch an empty list", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: true,
        isLoadingMore: false,
        focusedIndex: 0,
        threadCount: 0,
      }),
    ).toBe(false);
  });

  it("does not prefetch when the cursor is still far from the end", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: true,
        isLoadingMore: false,
        focusedIndex: 0,
        threadCount: 50,
      }),
    ).toBe(false);
  });

  it("prefetches when the cursor enters the remaining-thread window", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: true,
        isLoadingMore: false,
        focusedIndex: 50 - THREAD_PREFETCH_REMAINING,
        threadCount: 50,
      }),
    ).toBe(true);
  });

  it("does not prefetch one row before the remaining-thread window", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: true,
        isLoadingMore: false,
        focusedIndex: 50 - THREAD_PREFETCH_REMAINING - 1,
        threadCount: 50,
      }),
    ).toBe(false);
  });

  it("prefetches when the list is shorter than the remaining-thread window", () => {
    expect(
      shouldPrefetchMoreThreads({
        hasMore: true,
        isLoadingMore: false,
        focusedIndex: 0,
        threadCount: 3,
      }),
    ).toBe(true);
  });
});

describe("scrollElementIntoContainer", () => {
  it("leaves a fully visible row where it is", () => {
    const container = createBox({ top: 100, bottom: 500, scrollTop: 80 });
    const element = createBox({ top: 180, bottom: 220 });

    scrollElementIntoContainer(container, element, 8);

    expect(container.scrollTop).toBe(80);
  });

  it("scrolls down just enough when the row sits below the fold", () => {
    const container = createBox({ top: 100, bottom: 500, scrollTop: 80 });
    const element = createBox({ top: 520, bottom: 560 });

    scrollElementIntoContainer(container, element, 8);

    expect(container.scrollTop).toBe(148);
  });

  it("scrolls up just enough when the row sits above the fold", () => {
    const container = createBox({ top: 100, bottom: 500, scrollTop: 80 });
    const element = createBox({ top: 60, bottom: 100 });

    scrollElementIntoContainer(container, element, 8);

    expect(container.scrollTop).toBe(32);
  });

  it("aligns to the top when the row is taller than the container", () => {
    const container = createBox({ top: 100, bottom: 200, scrollTop: 40 });
    const element = createBox({ top: 80, bottom: 260 });

    scrollElementIntoContainer(container, element, 8);

    expect(container.scrollTop).toBe(12);
  });
});

function createBox({
  top,
  bottom,
  scrollTop = 0,
}: {
  top: number;
  bottom: number;
  scrollTop?: number;
}): HTMLElement {
  return {
    scrollTop,
    getBoundingClientRect: () => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON() {},
    }),
  } as HTMLElement;
}
