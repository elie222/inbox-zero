// @vitest-environment jsdom
import { act, renderHook, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalMailSearch } from "./use-local-mail-search";
import type { LocalSearchResult } from "@/utils/email-cache/search";

const mutations = vi.hoisted(() => ({
  mutations: [],
  isReady: true,
  isReadable: true,
}));
const persistent = vi.hoisted(() => vi.fn());
vi.mock("@/utils/email-cache/search-index-service", () => ({
  searchPersistentMail: persistent,
}));
const epochs = vi.hoisted(() => ({ valid: true }));
vi.mock("@/hooks/useMailMutationOverlay", () => ({
  useMailMutationOverlay: () => mutations,
}));
vi.mock("@/utils/email-cache/database", () => ({
  captureEmailCacheEpoch: () => [0, 0],
  isEmailCacheEpochCurrent: () => epochs.valid,
}));

class FakeWorker extends EventTarget {
  static instance: FakeWorker;
  requests: { id: number }[] = [];
  terminate = vi.fn();
  constructor() {
    super();
    FakeWorker.instance = this;
  }
  postMessage(request: { id: number }) {
    this.requests.push(request);
  }
  reply(
    index: number,
    result: LocalSearchResult = { status: "ready", threads: [] },
  ) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: { id: this.requests[index].id, result },
      }),
    );
  }
}
const accounts = [
  { id: "account-a", email: "user@example.com", name: null, image: null },
];
const labelsByAccount = {};
const props = {
  accounts,
  labelsByAccount,
  combined: false,
  query: "first",
  enabled: true,
};
beforeEach(() => {
  persistent.mockReset().mockResolvedValue(undefined);
  epochs.valid = true;
  mutations.isReady = true;
  mutations.isReadable = true;
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("local search orchestration", () => {
  it("uses disk search without scanning the legacy cache and consumes continuation cursors", async () => {
    persistent
      .mockResolvedValueOnce({
        status: "ready",
        threads: [],
        cursors: { "account-a": "100" },
      })
      .mockResolvedValueOnce({ status: "ready", threads: [] });
    const { result } = renderHook(() => useLocalMailSearch(props));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(FakeWorker.instance.requests).toHaveLength(0);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(persistent.mock.calls[1][0].cursors).toEqual({ "account-a": "100" });
    expect(result.current.hasMore).toBe(false);
  });
  it("warms one worker and ignores results belonging to an older query", async () => {
    const { result, rerender } = renderHook(
      (value) => useLocalMailSearch(value),
      { initialProps: props },
    );
    await act(async () => {});
    const worker = FakeWorker.instance;
    rerender({ ...props, query: "second" });
    act(() => worker.reply(0));
    expect(result.current.status).toBeUndefined();
    await act(async () => {});
    act(() => worker.reply(1));
    expect(result.current.status).toBe("ready");
    expect(FakeWorker.instance).toBe(worker);
  });
  it("clears results immediately when switching accounts", async () => {
    const { result, rerender } = renderHook(
      (value) => useLocalMailSearch(value),
      { initialProps: props },
    );
    await act(async () => {});
    act(() => FakeWorker.instance.reply(0));
    expect(result.current.status).toBe("ready");
    rerender({ ...props, accounts: [{ ...accounts[0], id: "account-b" }] });
    expect(result.current.status).toBeUndefined();
    expect(result.current.threads).toEqual([]);
    await act(async () => {});
    act(() => FakeWorker.instance.reply(0));
    expect(result.current.status).toBeUndefined();
  });
  it("rejects a response produced before cache deletion", async () => {
    const { result } = renderHook(() => useLocalMailSearch(props));
    epochs.valid = false;
    await act(async () => {});
    act(() => FakeWorker.instance.reply(0));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
  it("falls back when workers are unavailable or mutation state is unreadable", async () => {
    vi.stubGlobal("Worker", undefined);
    const { result } = renderHook(() => useLocalMailSearch(props));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
  it("does not search before pending actions are loaded", async () => {
    mutations.isReady = false;
    const { rerender } = renderHook(() => useLocalMailSearch(props));
    expect(FakeWorker.instance.requests).toHaveLength(0);
    mutations.isReady = true;
    rerender();
    await act(async () => {});
    expect(FakeWorker.instance.requests).toHaveLength(1);
  });
  it("does not scan when provider results have arrived", async () => {
    const { rerender } = renderHook((value) => useLocalMailSearch(value), {
      initialProps: props,
    });
    await act(async () => {});
    const worker = FakeWorker.instance;
    rerender({ ...props, enabled: false });
    act(() => worker.reply(0));
    expect(worker.requests).toHaveLength(1);
  });
  it("falls back if pending mutation storage cannot be read", () => {
    mutations.isReadable = false;
    const { result } = renderHook(() => useLocalMailSearch(props));
    expect(result.current.status).toBe("unavailable");
    expect(FakeWorker.instance.requests).toHaveLength(0);
  });
  it("times out a worker and terminates it on unmount", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useLocalMailSearch(props));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.status).toBe("unavailable");
    unmount();
    expect(FakeWorker.instance.terminate).toHaveBeenCalledOnce();
  });
});
