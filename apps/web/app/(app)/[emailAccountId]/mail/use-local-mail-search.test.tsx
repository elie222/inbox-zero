// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalMailSearch } from "./use-local-mail-search";
import type { LocalSearchResult } from "@/utils/email-cache/search";

const mutations = vi.hoisted(() => ({
  mutations: [],
  isReady: true,
  isReadable: true,
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
  it("warms one worker and ignores results belonging to an older query", () => {
    const { result, rerender } = renderHook(
      (value) => useLocalMailSearch(value),
      { initialProps: props },
    );
    const worker = FakeWorker.instance;
    rerender({ ...props, query: "second" });
    act(() => worker.reply(0));
    expect(result.current.status).toBeUndefined();
    act(() => worker.reply(1));
    expect(result.current.status).toBe("ready");
    expect(FakeWorker.instance).toBe(worker);
  });
  it("clears results immediately when switching accounts", () => {
    const { result, rerender } = renderHook(
      (value) => useLocalMailSearch(value),
      { initialProps: props },
    );
    act(() => FakeWorker.instance.reply(0));
    expect(result.current.status).toBe("ready");
    rerender({ ...props, accounts: [{ ...accounts[0], id: "account-b" }] });
    expect(result.current.status).toBeUndefined();
    expect(result.current.threads).toEqual([]);
    act(() => FakeWorker.instance.reply(0));
    expect(result.current.status).toBeUndefined();
  });
  it("rejects a response produced before cache deletion", () => {
    const { result } = renderHook(() => useLocalMailSearch(props));
    epochs.valid = false;
    act(() => FakeWorker.instance.reply(0));
    expect(result.current.status).toBe("unavailable");
  });
  it("falls back when workers are unavailable or mutation state is unreadable", () => {
    vi.stubGlobal("Worker", undefined);
    const { result } = renderHook(() => useLocalMailSearch(props));
    expect(result.current.status).toBe("unavailable");
  });
  it("does not search before pending actions are loaded", () => {
    mutations.isReady = false;
    const { rerender } = renderHook(() => useLocalMailSearch(props));
    expect(FakeWorker.instance.requests).toHaveLength(0);
    mutations.isReady = true;
    rerender();
    expect(FakeWorker.instance.requests).toHaveLength(1);
  });
  it("does not scan when provider results have arrived", () => {
    const { rerender } = renderHook((value) => useLocalMailSearch(value), {
      initialProps: props,
    });
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
  it("times out a worker and terminates it on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useLocalMailSearch(props));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.status).toBe("unavailable");
    unmount();
    expect(FakeWorker.instance.terminate).toHaveBeenCalledOnce();
  });
});
