// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retainSearchIndex } from "./search-index-service";
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
