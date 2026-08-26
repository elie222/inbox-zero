// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailMutationOutboxManager } from "./MailMutationOutboxManager";

const action = vi.hoisted(() => ({ execute: vi.fn() }));
const cache = vi.hoisted(() => ({ settle: vi.fn() }));
const mailbox = vi.hoisted(() => ({ request: vi.fn(), syncNow: vi.fn() }));
const outbox = vi.hoisted(() => ({
  blockAuth: vi.fn(),
  claim: vi.fn(),
  claimSyncGroup: vi.fn(),
  claimNotification: vi.fn(),
  complete: vi.fn(),
  completeSyncGroup: vi.fn(),
  fail: vi.fn(),
  getNextWakeAt: vi.fn(),
  markAwaitingSync: vi.fn(),
  renew: vi.fn(),
  renewSyncGroup: vi.fn(),
  resumeBlocked: vi.fn(),
  retry: vi.fn(),
  retrySyncGroup: vi.fn(),
  subscribe: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/utils/actions/mail-mutation", () => ({
  executeMailMutationAction: action.execute,
}));
vi.mock("@/utils/email-cache/mail-mutation-settlement", () => ({
  settleMailMutationInCache: cache.settle,
}));
vi.mock("@/app/(app)/[emailAccountId]/mail/use-mailbox-sync", () => ({
  requestMailboxSync: mailbox.request,
  syncMailboxNow: mailbox.syncNow,
}));
vi.mock("@/utils/email-cache/mail-mutations", () => ({
  blockMailMutationForAuth: outbox.blockAuth,
  claimNextMailMutation: outbox.claim,
  claimNextMailMutationSyncGroup: outbox.claimSyncGroup,
  claimNextMailMutationNotification: outbox.claimNotification,
  completeMailMutation: outbox.complete,
  completeMailMutationSyncGroup: outbox.completeSyncGroup,
  failMailMutation: outbox.fail,
  getNextMailMutationWakeAt: outbox.getNextWakeAt,
  markMailMutationAwaitingSync: outbox.markAwaitingSync,
  renewMailMutationLease: outbox.renew,
  renewMailMutationSyncGroupLease: outbox.renewSyncGroup,
  resumeBlockedMailMutations: outbox.resumeBlocked,
  retryMailMutation: outbox.retry,
  retryMailMutationSyncGroup: outbox.retrySyncGroup,
  subscribeToMailMutations: outbox.subscribe,
}));
vi.mock("@/components/Toast", () => ({ toastError: toast.error }));

const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
let listener: (() => void) | undefined;

describe("MailMutationOutboxManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setOnline(true);
    listener = undefined;
    outbox.subscribe.mockImplementation((nextListener) => {
      listener = nextListener;
      return vi.fn();
    });
    outbox.claim.mockResolvedValue(undefined);
    outbox.claimSyncGroup.mockResolvedValue(undefined);
    outbox.claimNotification.mockResolvedValue(undefined);
    outbox.getNextWakeAt.mockResolvedValue(undefined);
    outbox.renew.mockResolvedValue(false);
    outbox.renewSyncGroup.mockResolvedValue([]);
    outbox.resumeBlocked.mockResolvedValue(0);
    mailbox.syncNow.mockResolvedValue({ hasMore: false, pagesSynced: 1 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreProperty(navigator, "onLine", onlineDescriptor);
  });

  it("settles cache state before exposing terminal success", async () => {
    const mutation = archiveMutation();
    const syncGroup = wireSyncGroup(mutation);
    const reconciliation = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockResolvedValue({ data: { status: "applied" } });
    mailbox.syncNow.mockReturnValue(reconciliation.promise);

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(cache.settle).toHaveBeenCalledWith(mutation);
    expect(mailbox.syncNow).toHaveBeenCalledWith("account");
    expect(outbox.completeSyncGroup).not.toHaveBeenCalled();

    reconciliation.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();

    expect(outbox.completeSyncGroup).toHaveBeenCalledWith(
      syncGroup,
      expect.any(String),
    );
    expect(cache.settle.mock.invocationCallOrder[0]).toBeLessThan(
      outbox.markAwaitingSync.mock.invocationCallOrder[0],
    );
    expect(outbox.markAwaitingSync.mock.invocationCallOrder[0]).toBeLessThan(
      mailbox.syncNow.mock.invocationCallOrder[0],
    );
    expect(mailbox.syncNow.mock.invocationCallOrder[0]).toBeLessThan(
      outbox.completeSyncGroup.mock.invocationCallOrder[0],
    );
  });

  it("removes the obsolete local mail-action queue at startup", () => {
    window.localStorage.setItem("gmailActionQueue", "queued actions");

    render(<MailMutationOutboxManager />);

    expect(window.localStorage.getItem("gmailActionQueue")).toBeNull();
  });

  it("still starts when legacy local storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => render(<MailMutationOutboxManager />)).not.toThrow();
    expect(outbox.subscribe).toHaveBeenCalledOnce();
  });

  it("reconciles one mailbox sync for a durable multi-thread batch", async () => {
    const first = archiveMutation({ id: "first", threadId: "thread-1" });
    const second = archiveMutation({ id: "second", threadId: "thread-2" });
    const group = {
      batchId: "batch",
      emailAccountId: "account",
      mutations: [
        { ...first, status: "reconciling" as const },
        { ...second, status: "reconciling" as const },
      ],
    };
    let applied = 0;
    let claimed = false;
    outbox.claim
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValue(undefined);
    outbox.markAwaitingSync.mockImplementation(async () => {
      applied += 1;
      listener?.();
    });
    outbox.claimSyncGroup.mockImplementation(async () => {
      if (applied !== 2 || claimed) return;
      claimed = true;
      return group;
    });
    action.execute.mockResolvedValue({ data: { status: "applied" } });

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(cache.settle).toHaveBeenCalledTimes(2);
    expect(mailbox.syncNow).toHaveBeenCalledOnce();
    expect(mailbox.syncNow).toHaveBeenCalledWith("account");
    expect(outbox.completeSyncGroup).toHaveBeenCalledWith(
      group,
      expect.any(String),
    );
  });

  it("forwards a durable archive label to the provider action", async () => {
    const mutation = { ...archiveMutation(), labelId: "archive-label" };
    wireSyncGroup(mutation);
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockResolvedValue({ data: { status: "applied" } });

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(action.execute).toHaveBeenCalledWith("account", {
      kind: "archive",
      mutationId: "mutation",
      threadId: "thread",
      messageIds: ["message"],
      labelId: "archive-label",
    });
  });

  it("renews the sync-group lease while mailbox reconciliation is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const mutation = archiveMutation();
    const syncGroup = wireSyncGroup(mutation);
    const reconciliation = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockResolvedValue({ data: { status: "applied" } });
    mailbox.syncNow.mockReturnValue(reconciliation.promise);

    render(<MailMutationOutboxManager />);
    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(outbox.renewSyncGroup).toHaveBeenCalledWith(syncGroup, {
      leaseMs: 30_000,
      ownerId: expect.any(String),
    });

    reconciliation.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
    outbox.renewSyncGroup.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(outbox.renewSyncGroup).not.toHaveBeenCalled();
  });

  it("retries without completing when mailbox reconciliation fails", async () => {
    const mutation = archiveMutation();
    const syncGroup = wireSyncGroup(mutation);
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockResolvedValue({ data: { status: "applied" } });
    mailbox.syncNow.mockRejectedValue(new Error("sync failed"));

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(cache.settle).toHaveBeenCalledWith(mutation);
    expect(outbox.retrySyncGroup).toHaveBeenCalledWith(
      syncGroup,
      {
        error: "Mailbox reconciliation failed",
        nextAttemptAt: expect.any(Number),
      },
      expect.any(String),
    );
    expect(outbox.completeSyncGroup).not.toHaveBeenCalled();
  });

  it("backs off from the persisted reconciliation attempt after reload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const group = {
      batchId: "batch",
      emailAccountId: "account",
      mutations: [
        {
          ...archiveMutation(),
          status: "reconciling" as const,
          syncAttempts: 4,
        },
      ],
    };
    outbox.claimSyncGroup
      .mockResolvedValueOnce(group)
      .mockResolvedValue(undefined);
    mailbox.syncNow.mockRejectedValue(new Error("sync failed"));

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(outbox.retrySyncGroup).toHaveBeenCalledWith(
      group,
      {
        error: "Mailbox reconciliation failed",
        nextAttemptAt: 8000,
      },
      expect.any(String),
    );
  });

  it("does not remove cached mail when the server reconciles an expired snooze", async () => {
    const mutation = {
      ...archiveMutation({ attempts: 2 }),
      kind: "snooze" as const,
      scheduledFor: new Date(0).toISOString(),
    };
    const result = { reconciled: "snooze_expired" as const };
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockResolvedValue({
      data: { status: "applied", result },
    });

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(cache.settle).not.toHaveBeenCalled();
    expect(outbox.markAwaitingSync).toHaveBeenCalledWith(
      mutation.id,
      result,
      expect.any(String),
    );
  });

  it("keeps high-attempt retries durable and wakes exactly when due", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let mutation = archiveMutation({ attempts: 99 });
    let status: "pending" | "processing" | "retry_wait" | "succeeded" =
      "pending";
    let nextAttemptAt = 0;
    outbox.claim.mockImplementation(async ({ leaseMs, ownerId }) => {
      if (
        (status === "pending" || status === "retry_wait") &&
        nextAttemptAt <= Date.now()
      ) {
        status = "processing";
        mutation = {
          ...mutation,
          attempts: mutation.attempts + 1,
          leaseExpiresAt: Date.now() + leaseMs,
          leaseOwner: ownerId,
          status,
        };
        return mutation;
      }
    });
    outbox.getNextWakeAt.mockImplementation(async () =>
      status === "retry_wait" ? nextAttemptAt : undefined,
    );
    outbox.retry.mockImplementation(async (_id, options) => {
      status = "retry_wait";
      nextAttemptAt = options.nextAttemptAt;
      listener?.();
    });
    outbox.markAwaitingSync.mockImplementation(async () => {
      status = "succeeded";
    });
    action.execute
      .mockResolvedValueOnce({ data: { status: "retry" } })
      .mockResolvedValueOnce({ data: { status: "applied" } });

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(outbox.retry).toHaveBeenCalledOnce();
    expect(outbox.fail).not.toHaveBeenCalled();
    expect(action.execute).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(action.execute).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    await settlePromises();

    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(outbox.markAwaitingSync).toHaveBeenCalledOnce();
  });

  it("resumes auth-blocked work when the window regains focus", async () => {
    let mutation = archiveMutation();
    let status: "pending" | "processing" | "blocked_auth" | "succeeded" =
      "pending";
    outbox.claim.mockImplementation(async () => {
      if (status !== "pending") return;
      status = "processing";
      mutation = { ...mutation, attempts: mutation.attempts + 1, status };
      return mutation;
    });
    outbox.blockAuth.mockImplementation(async () => {
      status = "blocked_auth";
    });
    outbox.resumeBlocked.mockImplementation(async () => {
      if (status !== "blocked_auth") return 0;
      status = "pending";
      return 1;
    });
    outbox.markAwaitingSync.mockImplementation(async () => {
      status = "succeeded";
    });
    action.execute
      .mockResolvedValueOnce({ data: { status: "blocked_auth" } })
      .mockResolvedValueOnce({ data: { status: "applied" } });

    render(<MailMutationOutboxManager />);
    await settlePromises();
    expect(action.execute).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new Event("focus")));
    await settlePromises();

    expect(outbox.resumeBlocked).toHaveBeenCalled();
    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(outbox.markAwaitingSync).toHaveBeenCalledOnce();
  });

  it("surfaces a persisted uncertain reply only once", async () => {
    outbox.claimNotification
      .mockResolvedValueOnce({
        ...archiveMutation(),
        kind: "reply",
        status: "uncertain",
      })
      .mockResolvedValue(undefined);

    render(<MailMutationOutboxManager />);
    await settlePromises();
    listener?.();
    await settlePromises();

    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith({
      description: "This reply may have sent. Check Sent before retrying.",
    });
  });

  it("safely retries a reply when its applied action response is lost", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let mutation = replyMutation({ attempts: 0 });
    const result = { messageId: "message-2", threadId: "thread" };
    let status: "pending" | "processing" | "retry_wait" | "succeeded" =
      "pending";
    let nextAttemptAt = 0;
    outbox.claim.mockImplementation(async ({ leaseMs, ownerId }) => {
      if (
        (status === "pending" || status === "retry_wait") &&
        nextAttemptAt <= Date.now()
      ) {
        status = "processing";
        mutation = {
          ...mutation,
          attempts: mutation.attempts + 1,
          leaseExpiresAt: Date.now() + leaseMs,
          leaseOwner: ownerId,
          status,
        };
        return mutation;
      }
    });
    outbox.getNextWakeAt.mockImplementation(async () =>
      status === "retry_wait" ? nextAttemptAt : undefined,
    );
    outbox.retry.mockImplementation(async (_id, options) => {
      status = "retry_wait";
      nextAttemptAt = options.nextAttemptAt;
      listener?.();
    });
    outbox.complete.mockImplementation(async () => {
      status = "succeeded";
    });
    action.execute
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        data: { status: "already_applied", result },
      });

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(action.execute).toHaveBeenCalledOnce();
    expect(outbox.retry).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await settlePromises();

    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(mailbox.request).toHaveBeenCalledWith("account");
    expect(outbox.complete).toHaveBeenCalledWith(
      mutation.id,
      result,
      expect.any(String),
    );
  });

  it("settles a reply from its send operation without waiting for mailbox refresh", async () => {
    vi.useFakeTimers();
    const mutation = replyMutation();
    const result = { messageId: "message-2", threadId: "thread" };
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockReturnValue(new Promise(() => {}));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: "sent", result })),
    );

    render(<MailMutationOutboxManager />);
    await settlePromises();

    expect(fetch).toHaveBeenCalledWith(
      `/api/email-send-operations/${mutation.id}`,
      {
        headers: { "X-Email-Account-ID": "account" },
      },
    );
    expect(mailbox.request).toHaveBeenCalledWith("account");
    expect(mailbox.syncNow).not.toHaveBeenCalled();
    expect(outbox.complete).toHaveBeenCalledWith(
      mutation.id,
      result,
      expect.any(String),
    );
  });

  it("bounds a lost state-mutation request before retrying", async () => {
    vi.useFakeTimers();
    const mutation = archiveMutation();
    outbox.claim.mockResolvedValueOnce(mutation).mockResolvedValue(undefined);
    action.execute.mockReturnValue(new Promise(() => {}));

    render(<MailMutationOutboxManager />);
    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await settlePromises();

    expect(outbox.retry).toHaveBeenCalledWith(
      mutation.id,
      {
        error: "Mutation request failed",
        nextAttemptAt: expect.any(Number),
      },
      expect.any(String),
    );
  });
});

function archiveMutation({
  attempts = 1,
  id = "mutation",
  threadId = "thread",
}: {
  attempts?: number;
  id?: string;
  threadId?: string;
} = {}) {
  return {
    id,
    batchId: "batch",
    emailAccountId: "account",
    threadId,
    messageIds: ["message"],
    kind: "archive" as const,
    status: "processing" as const,
    attempts,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function replyMutation({ attempts = 1 }: { attempts?: number } = {}) {
  return {
    ...archiveMutation({ attempts }),
    kind: "reply" as const,
    email: {
      messageHtml: "<p>Hello</p>",
      subject: "Hello",
      to: "recipient@example.com",
    },
  };
}

function wireSyncGroup(mutation: ReturnType<typeof archiveMutation>) {
  const group = {
    batchId: mutation.batchId,
    emailAccountId: mutation.emailAccountId,
    mutations: [{ ...mutation, status: "reconciling" as const }],
  };
  let ready = false;
  let claimed = false;
  outbox.markAwaitingSync.mockImplementation(async () => {
    ready = true;
    listener?.();
  });
  outbox.claimSyncGroup.mockImplementation(async () => {
    if (!ready || claimed) return;
    claimed = true;
    return group;
  });
  return group;
}

async function settlePromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}
