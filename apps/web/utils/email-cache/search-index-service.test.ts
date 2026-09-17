// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reclaimSearchIndexStorage,
  warmSearchIndexStorage,
  retainSearchIndex,
} from "./search-index-service";
const state = vi.hoisted(() => ({
  active: false,
  initialize: vi.fn(),
  seed: vi.fn(),
  work: vi.fn(),
  drain: vi.fn(),
  request: vi.fn(),
  listeners: new Set<(event: { emailAccountId?: string }) => void>(),
}));
vi.mock("./mail-activation", () => ({
  isMailSyncActivated: () => state.active,
}));
vi.mock("./search-index-client", () => ({
  createSearchIndexClient: () => ({ request: state.request }),
}));
vi.mock("./search-index-query", () => ({ querySearchIndex: vi.fn() }));
vi.mock("./search-index-seed", () => ({
  initializeSearchIndexAccount: state.initialize,
  seedSearchIndexWork: state.seed,
}));
vi.mock("./search-index-work", () => ({ readSearchIndexWork: state.work }));
vi.mock("./search-index-drain", () => ({ drainSearchIndexWork: state.drain }));
vi.mock("./cache-events", () => ({
  subscribeToEmailCacheChanges: (
    listener: (event: { emailAccountId?: string }) => void,
  ) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
  notifyEmailCacheChange: (emailAccountId: string) => {
    for (const listener of state.listeners) listener({ emailAccountId });
  },
}));
let dispose = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  state.active = true;
  state.request.mockResolvedValue({ result: null });
  state.initialize.mockResolvedValue({ generation: "one" });
  state.work.mockResolvedValue({ work: [] });
  state.drain.mockResolvedValue({ status: "ready", hasMore: false });
});
afterEach(() => {
  dispose();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("bounded index maintenance", () => {
  it("accepts an initialized empty index and scopes warm-up to the activated account", async () => {
    state.request.mockImplementation(async (_scope, command) =>
      command.command === "state" && command.emailAccountId === "account"
        ? { result: null }
        : { error: "stale" },
    );
    expect(
      await warmSearchIndexStorage({
        emailAccountId: "account",
        generation: "one",
      }),
    ).toBe(true);
    state.active = false;
    expect(
      await warmSearchIndexStorage({
        emailAccountId: "account",
        generation: "one",
      }),
    ).toBe(false);
  });

  it("respects a paused migration deadline despite cache notifications", async () => {
    state.initialize.mockResolvedValue({
      generation: "one",
      seed: { store: "threadRows" },
    });
    state.seed.mockResolvedValue({
      generation: "one",
      complete: false,
      retryAfterMs: 60_000,
    });
    dispose = retainSearchIndex("account");
    await vi.advanceTimersByTimeAsync(200);
    expect(state.seed).toHaveBeenCalledTimes(1);
    for (const listener of state.listeners)
      listener({ emailAccountId: "account" });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(state.seed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.seed).toHaveBeenCalledTimes(2);
  });

  it("does not start storage for assistant-only accounts", async () => {
    state.active = false;
    dispose = retainSearchIndex("account");
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.initialize).not.toHaveBeenCalled();
  });
  it("drains in separate scheduled batches and stops when no work remains", async () => {
    state.work
      .mockResolvedValueOnce({ work: [{}] })
      .mockResolvedValueOnce({ work: [{}] })
      .mockResolvedValue({ work: [] });
    state.drain
      .mockResolvedValueOnce({ status: "ready", hasMore: true })
      .mockResolvedValue({ status: "ready", hasMore: false });
    dispose = retainSearchIndex("account");
    await vi.advanceTimersByTimeAsync(200);
    expect(state.drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.drain).toHaveBeenCalledTimes(2);
    const calls = state.initialize.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.initialize).toHaveBeenCalledTimes(calls);
  });
  it("backs off storage pressure without losing queued work or retrying on every source event", async () => {
    state.work.mockResolvedValue({ work: [{}] });
    state.drain.mockResolvedValue({ status: "storage-full" });
    dispose = retainSearchIndex("account");
    await vi.advanceTimersByTimeAsync(200);
    expect(state.drain).toHaveBeenCalledTimes(1);
    for (const listener of state.listeners)
      listener({ emailAccountId: "account" });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(state.drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.drain).toHaveBeenCalledTimes(2);
  });
  it.each([
    "warm",
    "drain",
  ])("retries an unavailable worker during %s after a bounded delay", async (phase) => {
    state.work.mockResolvedValue({ work: [{}] });
    state.drain.mockImplementation(async () => {
      state.work.mockResolvedValue({ work: [] });
      return { status: "ready", hasMore: false };
    });
    if (phase === "warm")
      state.request.mockResolvedValueOnce({ error: "unavailable" });
    else state.drain.mockResolvedValueOnce({ status: "unavailable" });
    dispose = retainSearchIndex("account");
    await vi.advanceTimersByTimeAsync(200);
    const initialRequests = state.request.mock.calls.length;
    const initialDrains = state.drain.mock.calls.length;
    for (const listener of state.listeners)
      listener({ emailAccountId: "account" });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(state.request).toHaveBeenCalledTimes(initialRequests);
    expect(state.drain).toHaveBeenCalledTimes(initialDrains);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.drain).toHaveBeenCalledTimes(initialDrains + 1);
  });
  it("keeps observing source changes until the final subscriber leaves", async () => {
    const first = retainSearchIndex("account");
    dispose = retainSearchIndex("account");
    first();
    await vi.advanceTimersByTimeAsync(200);
    state.work
      .mockResolvedValueOnce({ work: [{}] })
      .mockResolvedValue({ work: [] });
    for (const listener of state.listeners)
      listener({ emailAccountId: "account" });
    await vi.advanceTimersByTimeAsync(200);
    expect(state.drain).toHaveBeenCalledTimes(1);
    dispose();
    expect(state.listeners.size).toBe(0);
  });
});

describe("retention index reclamation", () => {
  const scope = { emailAccountId: "account", generation: "one" };
  const storage = {
    incrementalVacuum: true,
    beforeBytes: 100,
    afterBytes: 80,
    reusableBytes: 0,
  };
  it("does not reclaim storage for an inactive account", async () => {
    state.active = false;
    expect(await reclaimSearchIndexStorage(scope)).toEqual({
      status: "not-ready",
    });
    expect(state.work).not.toHaveBeenCalled();
    expect(state.request).not.toHaveBeenCalled();
  });
  it.each([
    { generation: "other", work: [], blockedCount: 0 },
    { generation: "one", work: [{}], blockedCount: 0 },
    { generation: "one", work: [], blockedCount: 1 },
  ])("does not acknowledge stale or pending work: %j", async (work) => {
    state.work.mockResolvedValue(work);
    expect(await reclaimSearchIndexStorage(scope)).toEqual({
      status: "not-ready",
    });
    expect(state.request).not.toHaveBeenCalled();
  });
  it("checks work again after reclamation before acknowledging the drain", async () => {
    state.work
      .mockResolvedValueOnce({ generation: "one", work: [], blockedCount: 0 })
      .mockResolvedValueOnce({
        generation: "one",
        work: [{}],
        blockedCount: 0,
      });
    state.request.mockResolvedValue({ result: storage });
    expect(await reclaimSearchIndexStorage(scope)).toEqual({
      status: "not-ready",
    });
  });
  it.each([
    "busy",
    "storage-full",
    "unavailable",
  ])("does not acknowledge failed reclamation: %s", async (error) => {
    state.work.mockResolvedValue({
      generation: "one",
      work: [],
      blockedCount: 0,
    });
    state.request.mockResolvedValue({ error });
    expect(await reclaimSearchIndexStorage(scope)).toEqual({
      status: "not-ready",
    });
  });
  it("exposes measured reusable pages only after work is drained", async () => {
    state.work.mockResolvedValue({
      generation: "one",
      work: [],
      blockedCount: 0,
    });
    state.request.mockResolvedValue({ result: storage });
    expect(await reclaimSearchIndexStorage(scope)).toEqual({
      status: "ready",
      storage,
    });
  });
});
