// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockArchiveThreadAction = vi.fn();
const mockTrashThreadAction = vi.fn();
const mockMarkReadThreadAction = vi.fn();
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

vi.mock("@/utils/actions/mail", () => ({
  archiveThreadAction: (...args: Parameters<typeof mockArchiveThreadAction>) =>
    mockArchiveThreadAction(...args),
  trashThreadAction: (...args: Parameters<typeof mockTrashThreadAction>) =>
    mockTrashThreadAction(...args),
  markReadThreadAction: (
    ...args: Parameters<typeof mockMarkReadThreadAction>
  ) => mockMarkReadThreadAction(...args),
}));

// Keeps the first thread mid-flight so the rest of the batch stays queued
// behind it (the email action queue runs one thread at a time).
function blockOn(threadId: string) {
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });

  const implementation = async (
    _emailAccountId: string,
    { threadId: id }: { threadId: string },
  ) => {
    if (id === threadId) await blocked;
  };

  return { release, implementation };
}

const archivedThreadIds = () =>
  mockArchiveThreadAction.mock.calls.map(([, input]) => input.threadId);

// The queue state is persisted, and ArchiveProgress reads it to draw the bar.
const persistedTotalThreads = () =>
  JSON.parse(window.localStorage.getItem("gmailActionQueue") ?? "{}")
    .totalThreads;

describe("cancelQueuedThreads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Keep these browser-storage tests isolated from Node's ambient storage.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: window.sessionStorage,
    });
    window.localStorage.clear();
    mockArchiveThreadAction.mockResolvedValue(undefined);
    mockTrashThreadAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(
        window,
        "localStorage",
        originalLocalStorageDescriptor,
      );
    } else {
      Reflect.deleteProperty(window, "localStorage");
    }
  });

  it("stops a queued thread from ever reaching the provider", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails, cancelQueuedThreads } = await import(
      "./archive-queue"
    );
    const onSuccess = vi.fn();

    await archiveEmails({
      threadIds: ["thread-1", "thread-2"],
      onSuccess,
      emailAccountId: "account-1",
    });
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    const result = cancelQueuedThreads({
      threadIds: ["thread-2"],
      actionType: "archive",
    });

    expect(result).toEqual({ cancelled: ["thread-2"], notCancelled: [] });

    release();
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith("thread-1"));

    expect(archivedThreadIds()).toEqual(["thread-1"]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("cancels a thread that was queued twice before it ran", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails, cancelQueuedThreads } = await import(
      "./archive-queue"
    );

    await archiveEmails({
      threadIds: ["thread-1", "thread-2"],
      onSuccess: vi.fn(),
      emailAccountId: "account-1",
    });
    // A second enqueue of the same thread must not orphan the first job, or
    // cancelling would report success while the orphan still archived it.
    await archiveEmails({
      threadIds: ["thread-2"],
      onSuccess: vi.fn(),
      emailAccountId: "account-1",
    });
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    expect(
      cancelQueuedThreads({ threadIds: ["thread-2"], actionType: "archive" }),
    ).toEqual({ cancelled: ["thread-2"], notCancelled: [] });

    release();
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    expect(archivedThreadIds()).not.toContain("thread-2");
  });

  it("does not count a deduplicated re-enqueue towards progress", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails } = await import("./archive-queue");

    await archiveEmails({
      threadIds: ["thread-1", "thread-2"],
      onSuccess: vi.fn(),
      emailAccountId: "account-1",
    });
    await archiveEmails({
      threadIds: ["thread-2"],
      onSuccess: vi.fn(),
      emailAccountId: "account-1",
    });

    // ArchiveProgress uses totalThreads as its denominator, so counting work
    // that was never enqueued would leave the bar stuck short of 100%.
    expect(persistedTotalThreads()).toBe(2);

    release();
  });

  it("reports a thread already sent to the provider as not cancelled", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails, cancelQueuedThreads } = await import(
      "./archive-queue"
    );
    const onSuccess = vi.fn();

    await archiveEmails({
      threadIds: ["thread-1"],
      onSuccess,
      emailAccountId: "account-1",
    });
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    const result = cancelQueuedThreads({
      threadIds: ["thread-1"],
      actionType: "archive",
    });

    expect(result).toEqual({ cancelled: [], notCancelled: ["thread-1"] });

    // the in-flight archive still completes; the caller has to undo it server-side
    release();
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith("thread-1"));
  });

  it("splits a batch into cancelled and still-in-flight threads", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails, cancelQueuedThreads } = await import(
      "./archive-queue"
    );
    const onSuccess = vi.fn();

    await archiveEmails({
      threadIds: ["thread-1", "thread-2", "thread-3"],
      onSuccess,
      emailAccountId: "account-1",
    });
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    const result = cancelQueuedThreads({
      threadIds: ["thread-1", "thread-2", "thread-3"],
      actionType: "archive",
    });

    expect(result).toEqual({
      cancelled: ["thread-2", "thread-3"],
      notCancelled: ["thread-1"],
    });

    release();
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith("thread-1"));

    expect(archivedThreadIds()).toEqual(["thread-1"]);
  });

  it("clears cancelled threads from the queue progress state", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails, cancelQueuedThreads } = await import(
      "./archive-queue"
    );

    await archiveEmails({
      threadIds: ["thread-1", "thread-2", "thread-3"],
      onSuccess: vi.fn(),
      emailAccountId: "account-1",
    });
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    cancelQueuedThreads({
      threadIds: ["thread-2", "thread-3"],
      actionType: "archive",
    });

    const { activeThreads, totalThreads } = readPersistedQueueState();
    expect(Object.keys(activeThreads)).toEqual(["archive-thread-1"]);
    expect(totalThreads).toBe(1);

    release();
  });

  it("only cancels threads queued for the requested action", async () => {
    const { release, implementation } = blockOn("thread-1");
    mockArchiveThreadAction.mockImplementation(implementation);

    const { archiveEmails, cancelQueuedThreads } = await import(
      "./archive-queue"
    );

    await archiveEmails({
      threadIds: ["thread-1", "thread-2"],
      onSuccess: vi.fn(),
      emailAccountId: "account-1",
    });
    await vi.waitFor(() => expect(archivedThreadIds()).toEqual(["thread-1"]));

    expect(
      cancelQueuedThreads({ threadIds: ["thread-2"], actionType: "delete" }),
    ).toEqual({ cancelled: [], notCancelled: ["thread-2"] });

    expect(
      cancelQueuedThreads({ threadIds: ["thread-2"], actionType: "archive" }),
    ).toEqual({ cancelled: ["thread-2"], notCancelled: [] });

    release();
  });

  it("returns unknown and empty thread ids as not cancelled", async () => {
    const { cancelQueuedThreads } = await import("./archive-queue");

    expect(
      cancelQueuedThreads({ threadIds: [], actionType: "archive" }),
    ).toEqual({ cancelled: [], notCancelled: [] });

    expect(
      cancelQueuedThreads({
        threadIds: ["never-queued"],
        actionType: "delete",
      }),
    ).toEqual({ cancelled: [], notCancelled: ["never-queued"] });
  });
});

// The queue atom isn't exported; it persists to localStorage on every write,
// which is the same state the progress UI reads through `useQueueState`.
function readPersistedQueueState() {
  return JSON.parse(
    window.localStorage.getItem("gmailActionQueue") ?? "{}",
  ) as {
    activeThreads: Record<string, unknown>;
    totalThreads: number;
  };
}
