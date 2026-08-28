// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";

const pages = vi.hoisted(() => ({
  current: [{ threads: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }],
}));

vi.mock("swr/infinite", () => ({
  default: () => ({
    data: pages.current,
    size: 1,
    setSize: vi.fn(),
    isLoading: false,
    error: undefined,
    mutate: (updater: unknown) => {
      if (typeof updater === "function") {
        pages.current = (updater as (p: unknown) => typeof pages.current)(
          pages.current,
        );
      }
      return Promise.resolve(pages.current);
    },
  }),
}));
vi.mock("@/hooks/useMailMutationOverlay", () => ({
  applyMailMutationOverlayToThreads: ({ threads }: { threads: unknown[] }) =>
    threads,
  useRetainedMailMutationOverlay: () => ({
    isReady: true,
    mutations: [],
  }),
}));
vi.mock("@/utils/email-cache/thread-lists", () => ({
  readCachedThreadList: vi.fn().mockResolvedValue(undefined),
  removeCachedThreadsFromView: vi.fn().mockResolvedValue(undefined),
  restoreCachedThreadsToView: vi.fn().mockResolvedValue(undefined),
  writeCachedThreadList: vi.fn().mockResolvedValue(undefined),
  writeCachedThreadRows: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/email-cache/mailbox", () => ({
  readSyncedMailboxThreads: vi.fn().mockResolvedValue(undefined),
  subscribeToMailboxStore: vi.fn(() => () => {}),
}));
vi.mock("@/utils/email-cache/analytics", () => ({
  trackMailboxListReady: vi.fn(),
}));

const ids = () => pages.current[0].threads.map((thread) => thread.id);

function setup() {
  pages.current = [
    { threads: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] },
  ];
  return renderHook(
    (query) => useMailThreads({ emailAccountId: "account", query }),
    {
      initialProps: { type: "inbox" } as { type: string },
    },
  );
}

describe("useMailThreads restore ordering", () => {
  it("puts a row back where it was", () => {
    const { result } = setup();

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["b"]);
    });
    expect(ids()).toEqual(["a", "c", "d"]);

    act(() => result.current.restoreThreads(removal, ["b"]));
    expect(ids()).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps position when a later batch removed a row above it", () => {
    const { result } = setup();

    let first!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      first = result.current.removeThreads(["c"]);
    });
    act(() => {
      result.current.removeThreads(["a"]);
    });
    expect(ids()).toEqual(["b", "d"]);

    // `c` sat after `b`, so it must land between b and d — not at its old index.
    act(() => result.current.restoreThreads(first, ["c"]));
    expect(ids()).toEqual(["b", "c", "d"]);
  });

  it("restores a row that was first back to the front", () => {
    const { result } = setup();

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["a"]);
    });
    act(() => result.current.restoreThreads(removal, ["a"]));

    expect(ids()).toEqual(["a", "b", "c", "d"]);
  });

  it("restores a contiguous batch in order", () => {
    const { result } = setup();

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["b", "c"]);
    });
    expect(ids()).toEqual(["a", "d"]);

    act(() => result.current.restoreThreads(removal, ["b", "c"]));
    expect(ids()).toEqual(["a", "b", "c", "d"]);
  });

  it("restores only the threads asked for", () => {
    const { result } = setup();

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["b", "c"]);
    });

    // A failed reversal must leave its row out of the list.
    act(() => result.current.restoreThreads(removal, ["b"]));
    expect(ids()).toEqual(["a", "b", "d"]);
  });

  it("does not let a later batch claim a thread already removed", () => {
    const { result } = setup();

    let first!: ReturnType<typeof result.current.removeThreads>;
    let second!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      first = result.current.removeThreads(["b"]);
      second = result.current.removeThreads(["b"]);
    });

    act(() => result.current.restoreThreads(second, ["b"]));
    expect(ids()).toEqual(["a", "c", "d"]);

    act(() => result.current.restoreThreads(first, ["b"]));
    expect(ids()).toEqual(["a", "b", "c", "d"]);
  });

  it("refuses to restore into a different split", () => {
    const { result, rerender } = setup();

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["b"]);
    });

    rerender({ type: "CATEGORY_PROMOTIONS" });
    act(() => result.current.restoreThreads(removal, ["b"]));

    expect(ids()).toEqual(["a", "c", "d"]);
  });
});
