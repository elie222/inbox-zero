import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailMutation } from "@/utils/email-cache/mail-mutations";
import { queueReaderEmail } from "./queued-reply";

const outbox = vi.hoisted(() => ({
  claimNotification: vi.fn(),
  enqueue: vi.fn(),
  get: vi.fn(),
  listener: undefined as (() => void) | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock("@/utils/email-cache/mail-mutations", () => ({
  claimMailMutationNotification: outbox.claimNotification,
  enqueueMailMutation: outbox.enqueue,
  getMailMutation: outbox.get,
  subscribeToMailMutations: vi.fn((listener: () => void) => {
    outbox.listener = listener;
    return outbox.unsubscribe;
  }),
}));

describe("queueReaderEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outbox.listener = undefined;
    outbox.enqueue.mockImplementation(async (input) => ({
      ...createMutation("pending"),
      ...input,
    }));
    outbox.get.mockResolvedValue(createMutation("pending"));
    outbox.claimNotification.mockResolvedValue(undefined);
  });

  it("returns immediately after durably queueing while offline", async () => {
    const outcome = await queueReaderEmail({
      email: createEmail(),
      emailAccountId: "account-two",
      messageIds: ["message"],
      online: false,
      threadId: "thread",
    });

    expect(outbox.enqueue).toHaveBeenCalledWith({
      email: createEmail(),
      emailAccountId: "account-two",
      kind: "reply",
      messageIds: ["message"],
      threadId: "thread",
    });
    expect(outcome).toEqual({
      reason: "offline",
      status: "queued",
      threadId: "thread",
    });
    expect(outbox.get).not.toHaveBeenCalled();
  });

  it("reuses a persisted reply identity without enqueueing a duplicate", async () => {
    await queueReaderEmail({
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: false,
      threadId: "thread",
      mutationId: "mutation",
    });
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("refuses changed content under an existing reply identity", async () => {
    await expect(
      queueReaderEmail({
        email: { ...createEmail(), messageHtml: "Changed" },
        emailAccountId: "account",
        messageIds: ["message"],
        online: false,
        threadId: "thread",
        mutationId: "mutation",
      }),
    ).rejects.toThrow("different content");
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("observes the persisted provider result while online", async () => {
    let current = createMutation("processing");
    outbox.get.mockImplementation(async () => current);
    const pending = queueReaderEmail({
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: true,
      settlementTimeoutMs: 1000,
      threadId: "thread",
    });
    await vi.waitFor(() => expect(outbox.listener).toBeTypeOf("function"));

    current = createMutation("succeeded", {
      result: { messageId: "sent-message", threadId: "sent-thread" },
    });
    outbox.listener?.();

    await expect(pending).resolves.toEqual({
      messageId: "sent-message",
      status: "sent",
      threadId: "sent-thread",
    });
    expect(outbox.unsubscribe).toHaveBeenCalledOnce();
  });

  it("rechecks when completion arrives during an in-flight storage read", async () => {
    let finishFirstRead: ((mutation: MailMutation) => void) | undefined;
    outbox.get
      .mockReturnValueOnce(
        new Promise<MailMutation>((resolve) => {
          finishFirstRead = resolve;
        }),
      )
      .mockResolvedValueOnce(
        createMutation("succeeded", {
          result: { messageId: "sent-message", threadId: "sent-thread" },
        }),
      );
    const pending = queueReaderEmail({
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: true,
      settlementTimeoutMs: 1000,
      threadId: "thread",
    });
    await vi.waitFor(() => expect(outbox.get).toHaveBeenCalledOnce());

    outbox.listener?.();
    finishFirstRead?.(createMutation("processing"));

    await expect(pending).resolves.toEqual({
      messageId: "sent-message",
      status: "sent",
      threadId: "sent-thread",
    });
    expect(outbox.get).toHaveBeenCalledTimes(2);
  });

  it("does not turn an uncertain delivery into an automatic retry", async () => {
    outbox.get.mockResolvedValue(createMutation("uncertain"));
    outbox.claimNotification.mockResolvedValue(createMutation("uncertain"));

    await expect(
      queueReaderEmail({
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      ownsNotification: true,
      status: "uncertain",
      threadId: "thread",
    });

    expect(outbox.enqueue).toHaveBeenCalledOnce();
    expect(outbox.claimNotification).toHaveBeenCalledWith("mutation-id");
  });

  it("returns the persisted terminal failure", async () => {
    const failed = createMutation("failed", {
      lastError: "Provider rejected the email",
    });
    outbox.get.mockResolvedValue(failed);
    outbox.claimNotification.mockResolvedValue(failed);

    await expect(
      queueReaderEmail({
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      error: "Provider rejected the email",
      ownsNotification: true,
      status: "failed",
    });
  });

  it("leaves terminal toast ownership with the global notifier when already claimed", async () => {
    outbox.get.mockResolvedValue(createMutation("uncertain"));
    outbox.claimNotification.mockResolvedValue(undefined);

    await expect(
      queueReaderEmail({
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      ownsNotification: false,
      status: "uncertain",
      threadId: "thread",
    });
  });

  it("recovers from a transient mutation read error on a later notification", async () => {
    outbox.get
      .mockRejectedValueOnce(new Error("temporary IndexedDB read failure"))
      .mockResolvedValueOnce(
        createMutation("succeeded", {
          result: { messageId: "sent-message", threadId: "sent-thread" },
        }),
      );
    const pending = queueReaderEmail({
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: true,
      settlementTimeoutMs: 1000,
      threadId: "thread",
    });
    await vi.waitFor(() => expect(outbox.get).toHaveBeenCalledOnce());

    outbox.listener?.();

    await expect(pending).resolves.toEqual({
      messageId: "sent-message",
      status: "sent",
      threadId: "sent-thread",
    });
  });

  it("explains when the queued email is waiting for account reconnection", async () => {
    outbox.get.mockResolvedValue(createMutation("blocked_auth"));

    await expect(
      queueReaderEmail({
        email: createEmail(),
        emailAccountId: "account",
        messageIds: ["message"],
        online: true,
        threadId: "thread",
      }),
    ).resolves.toEqual({
      reason: "blocked_auth",
      status: "queued",
      threadId: "thread",
    });
  });

  it("keeps a slow online send queued instead of resubmitting it", async () => {
    vi.useFakeTimers();
    const pending = queueReaderEmail({
      email: createEmail(),
      emailAccountId: "account",
      messageIds: ["message"],
      online: true,
      settlementTimeoutMs: 100,
      threadId: "thread",
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toEqual({
      reason: "pending",
      status: "queued",
      threadId: "thread",
    });
    vi.useRealTimers();
  });
});

function createEmail() {
  return {
    messageHtml: "<p>Hello</p>",
    subject: "Re: Hello",
    to: "person@example.com",
  };
}

function createMutation(
  status: MailMutation["status"],
  extra: Partial<MailMutation> = {},
): MailMutation {
  return {
    id: "mutation-id",
    batchId: "mutation-id",
    emailAccountId: "account",
    threadId: "thread",
    messageIds: ["message"],
    kind: "reply",
    email: createEmail(),
    status,
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}
