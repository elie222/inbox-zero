import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProviderOperationExecutor } from "./operations";
import type { EmailProvider } from "@/utils/email/types";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import prisma from "@/utils/__mocks__/prisma";
import {
  activatePreparedSnoozedThread,
  cancelSnoozedThreadByClientMutationId,
  claimSnoozePreparation,
  getPendingSnoozeRollbackMessageIds,
  getSnoozedThreadByClientMutationId,
  prepareSnoozedThread,
  releaseSnoozePreparation,
  SNOOZE_EXECUTION_LEASE_MS,
  updateSnoozeArchiveWrite,
} from "@/utils/snooze/scheduler";
import {
  findScheduledEmail,
  holdEmailForUndo,
} from "@/utils/scheduled-email/service";
import type { ScheduledEmail } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { convertMessage } from "@/utils/outlook/message";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/durable-email-send", () => ({
  executeDurableEmailSend: vi.fn(),
}));
vi.mock("@/utils/scheduled-email/service", () => ({
  findScheduledEmail: vi.fn(),
  holdEmailForUndo: vi.fn(),
  releaseHeldEmail: vi.fn(async (row: unknown) => row),
  cancelHeldEmail: vi.fn(),
}));
vi.mock(import("@/utils/snooze/scheduler"), async (importOriginal) => ({
  ...(await importOriginal()),
  prepareSnoozedThread: vi.fn(),
  activatePreparedSnoozedThread: vi.fn(),
  cancelSnoozedThreadByClientMutationId: vi.fn(),
  getSnoozedThreadByClientMutationId: vi.fn(),
  claimSnoozePreparation: vi.fn(async () => new Date()),
  getPendingSnoozeRollbackMessageIds: vi.fn().mockResolvedValue(new Set()),
  releaseSnoozePreparation: vi.fn(),
  updateSnoozeArchiveWrite: vi.fn().mockResolvedValue(true),
}));

describe("createEmailProviderOperationExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(getPendingSnoozeRollbackMessageIds).mockResolvedValue(new Set());
  });
  it.each([
    "execute",
    "inspect",
  ] as const)("%s clears local inbox flags only for confirmed Outlook archive targets", async (method) => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        async archiveMessages(ids: string[]) {
          if (ids.includes("missing")) throw new Error("not found 404");
        },
        async getMessage(id: string) {
          if (id === "missing") throw new Error("not found 404");
          return {
            id,
            threadId: `t-${id}`,
            headers: {
              from: "newsletter@example.com",
              to: "owner@example.com",
            },
            labelIds: id === "still-inbox" ? ["INBOX"] : [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    prisma.emailMessage.updateMany.mockResolvedValue({ count: 1 });

    const operation = metadataOperation(
      ["archived", "still-inbox", "missing"].map((messageId) => ({
        accountId: "acc-1",
        messageId,
      })),
    );
    const result = await executor[method]({
      operation,
      attemptId: "attempt-1",
      receiptId: "bulk-1",
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("confirmed");
    expect(prisma.emailMessage.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        emailAccountId: "acc-1",
        messageId: { in: ["archived"] },
      },
      data: { inbox: false },
    });
  });

  it("archives every target with one provider call and one batched read", async () => {
    const archiveMessages = vi.fn();
    const getMessage = vi.fn();
    const getMessagesBatch = vi.fn(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        threadId: `t-${id}`,
        headers: { from: "ada@example.com", to: "me@example.com" },
        labelIds: id === "still-inbox" ? ["INBOX"] : [],
        snippet: id,
      })),
    );
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        getMessage,
        getMessagesBatch,
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: metadataOperation([
        { accountId: "acc-1", messageId: "m1" },
        { accountId: "acc-1", messageId: "m2" },
        { accountId: "acc-1", messageId: "still-inbox" },
      ]),
      attemptId: "a1",
      signal: new AbortController().signal,
    });
    expect(archiveMessages).toHaveBeenCalledTimes(1);
    expect(archiveMessages).toHaveBeenCalledWith(["m1", "m2", "still-inbox"]);
    expect(getMessagesBatch).toHaveBeenCalledTimes(1);
    expect(getMessage).not.toHaveBeenCalled();
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(
      result.targets.map(
        (target) => `${target.key.messageId}:${target.outcome}`,
      ),
    ).toEqual(["m1:applied", "m2:applied", "still-inbox:uncertain"]);
    expect(prisma.emailMessage.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        emailAccountId: "acc-1",
        messageId: { in: ["m1", "m2"] },
      },
      data: { inbox: false },
    });
  });

  it("keeps verifying other messages when a batched read fails", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        archiveMessages: vi.fn(),
        getMessagesBatch: vi.fn().mockRejectedValue(new Error("throttled")),
        async getMessage(id: string) {
          if (id === "unreadable") throw new Error("throttled");
          return {
            id,
            threadId: `t-${id}`,
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: id === "still-inbox" ? ["INBOX"] : [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: metadataOperation([
        { accountId: "acc-1", messageId: "m1" },
        { accountId: "acc-1", messageId: "still-inbox" },
        { accountId: "acc-1", messageId: "unreadable" },
      ]),
      attemptId: "a1",
      signal: new AbortController().signal,
    });
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(
      result.targets.map(
        (target) => `${target.key.messageId}:${target.outcome}`,
      ),
    ).toEqual(["m1:applied", "still-inbox:uncertain", "unreadable:applied"]);
  });

  it("keeps an applied archive confirmed when the local stats write fails", async () => {
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        archiveMessages,
        getMessagesBatch: vi.fn().mockResolvedValue([]),
      } as unknown as EmailProvider,
    });
    prisma.emailMessage.updateMany.mockRejectedValue(
      new Error("database unavailable"),
    );

    const result = await executor.execute({
      operation: metadataOperation([
        { accountId: "acc-1", messageId: "archived" },
      ]),
      attemptId: "attempt-1",
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("confirmed");
    expect(archiveMessages).toHaveBeenCalledOnce();
    expect(prisma.emailMessage.updateMany).toHaveBeenCalledOnce();
  });

  it("falls back to per-message outcomes when the bulk call fails", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveMessages(ids: string[]) {
          if (ids.includes("missing")) throw new Error("not found 404");
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: `t-${id}`,
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const operation = metadataOperation([
      { accountId: "acc-1", messageId: "kept" },
      { accountId: "acc-1", messageId: "missing" },
    ]);
    const result = await executor.execute({
      operation,
      attemptId: "a1",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(
      result.targets.map(
        (target) => `${target.key.messageId}:${target.outcome}`,
      ),
    ).toEqual(["kept:applied", "missing:rejected"]);
  });

  it("does not confirm inspected archive when the provider message is still in the inbox", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessage(id: string) {
          return {
            id,
            threadId: `t-${id}`,
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.inspect({
      operation: metadataOperation([{ accountId: "acc-1", messageId: "m1" }]),
      receiptId: "bulk-1",
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ status: "uncertain", receiptId: "bulk-1" });
    expect(prisma.emailMessage.updateMany).not.toHaveBeenCalled();
  });

  it("confirms inspected archive after the provider message leaves the inbox", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessage(id: string) {
          return {
            id,
            threadId: `t-${id}`,
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.inspect({
      operation: metadataOperation([{ accountId: "acc-1", messageId: "m1" }]),
      receiptId: "bulk-1",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(result.targets).toEqual([
      {
        key: { accountId: "acc-1", messageId: "m1" },
        outcome: "applied",
        code: null,
      },
    ]);
  });

  it("uses the provider not-spam boundary for set_spam false", async () => {
    const markNotSpam = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        markNotSpam,
        getMessagesBatch: vi.fn().mockResolvedValue([]),
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-spam",
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: {
        ...metadataOperation([{ accountId: "acc-1", messageId: "spam-1" }]),
        intent: {
          kind: "metadata",
          targets: [{ accountId: "acc-1", messageId: "spam-1" }],
          change: { kind: "set_spam", spam: false },
        },
      },
      attemptId: "a-unspam",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(markNotSpam).toHaveBeenCalledWith("thread-spam");
  });

  it("discards a draft by its provider id and drops every copy it was saved as", async () => {
    const deleteDraft = vi.fn(async () => true);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        getDraft: vi.fn(async () => ({ id: "m2" })),
        getDraftReferenceForMessage: vi.fn(async (messageId: string) =>
          messageId === "m2" ? { id: "d1", version: "v2" } : null,
        ),
        deleteDraft,
        getMessage: vi.fn(async () => {
          throw new Error("Requested entity was not found. 404");
        }),
      } as unknown as EmailProvider,
    });

    const result = await executor.execute({
      operation: discardOperation(["m1", "m2"], "d1"),
      attemptId: "attempt-1",
      signal: new AbortController().signal,
    });

    expect(deleteDraft).toHaveBeenCalledExactlyOnceWith("d1", "v2");
    expect(result).toMatchObject({
      status: "confirmed",
      observations: [
        { kind: "message_deleted", key: { messageId: "m1" } },
        { kind: "message_deleted", key: { messageId: "m2" } },
      ],
    });
  });

  it("rejects a discard when the draft changed since it was opened", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        getDraftReferenceForMessage: vi.fn(async () => ({
          id: "d1",
          version: "v1",
        })),
        deleteDraft: vi.fn(async () => false),
        getDraft: vi.fn(async () => ({ id: "m1" })),
      } as unknown as EmailProvider,
    });

    const result = await executor.execute({
      operation: discardOperation(["m1"]),
      attemptId: "attempt-1",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ status: "rejected", code: "draft_changed" });
  });

  it("settles a refused discard as applied when the draft is already gone", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        getDraftReferenceForMessage: vi.fn(async () => ({
          id: "d1",
          version: "v1",
        })),
        deleteDraft: vi.fn(async () => false),
        getDraft: vi.fn(async () => null),
        getMessage: vi.fn(async () => null),
      } as unknown as EmailProvider,
    });

    const result = await executor.execute({
      operation: discardOperation(["m1"]),
      attemptId: "attempt-1",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ status: "confirmed" });
  });

  it("keeps a draft that was sent elsewhere as the sent message", async () => {
    const deleteDraft = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        getDraftReferenceForMessage: vi.fn(async () => null),
        deleteDraft,
        getMessage: vi.fn(async (id: string) => ({
          id,
          threadId: "t1",
          headers: { from: "owner@example.com", to: "friend@example.com" },
          labelIds: ["SENT"],
          snippet: "hello",
        })),
      } as unknown as EmailProvider,
    });

    const result = await executor.execute({
      operation: discardOperation(["m1"]),
      attemptId: "attempt-1",
      signal: new AbortController().signal,
    });

    expect(deleteDraft).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "confirmed",
      observations: [{ kind: "message_patch", key: { messageId: "m1" } }],
    });
  });

  it("executes sends through the existing durable receipt ledger", async () => {
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-1", threadId: "t-1" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(),
      attemptId: "a-send",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        input: expect.objectContaining({
          email: expect.objectContaining({
            to: "ada@example.com",
            subject: "Hi",
            replyToEmail: undefined,
          }),
        }),
      }),
    );
  });

  it("observes the sent message so the mailbox can drop the draft", async () => {
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-1", threadId: "t-1" },
    });
    const getMessage = vi.fn(async (id: string) => ({
      id,
      threadId: "t-1",
      headers: { from: "me@example.com", to: "ada@example.com" },
      labelIds: ["SENT"],
      snippet: "Hi",
      historyId: "7",
      textHtml: "<p>Hi</p>",
    }));
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google", getMessage } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(),
      attemptId: "a-send-observe",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(getMessage).toHaveBeenCalledWith("sent-1");
    expect(result.observations).toEqual([
      expect.objectContaining({
        kind: "message_patch",
        key: { accountId: "acc-1", messageId: "sent-1" },
        fields: expect.objectContaining({ roles: ["sent"] }),
      }),
    ]);
    expect(result.bodies).toEqual([
      expect.objectContaining({
        key: { accountId: "acc-1", messageId: "sent-1" },
        version: "7",
        html: "<p>Hi</p>",
      }),
    ]);
  });

  it("replies with a provider thread id, not an optional conversation id", async () => {
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-reply", threadId: "thread-1" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(undefined, {
        replyToMessageId: "msg-1",
        replyToConversationId: "thread-1",
      }),
      attemptId: "a-send-reply",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          threadId: "thread-1",
          email: expect.objectContaining({
            replyToEmail: {
              threadId: "thread-1",
              messageId: "msg-1",
            },
          }),
        }),
      }),
    );
  });

  it("sends by converting the frozen provider draft", async () => {
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-1", threadId: "t-1" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation("gmail-draft-1"),
      attemptId: "a-send-draft",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          email: expect.objectContaining({
            providerDraftId: "gmail-draft-1",
          }),
        }),
      }),
    );
  });

  it("inspects a persisted send receipt without sending again", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      status: "SENT",
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.inspect({
      operation: sendOperation(),
      receiptId: "receipt",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("holds an undo-window send on the server instead of sending it", async () => {
    const sendAtMs = Date.now() + 30_000;
    vi.mocked(findScheduledEmail).mockResolvedValue(null);
    vi.mocked(holdEmailForUndo).mockImplementation(async ({ input, sendAt }) =>
      heldRow({ payload: input, sendAt }),
    );
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });

    const result = await executor.execute({
      operation: heldSendOperation(sendAtMs),
      attemptId: "a-held",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ status: "accepted" });
    expect(result.status === "accepted" && result.retryAfterMs).toBeGreaterThan(
      25_000,
    );
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
    expect(holdEmailForUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        sendAt: new Date(sendAtMs),
        input: expect.objectContaining({
          threadId: "thread-1",
          messageIds: ["msg-1"],
          email: expect.objectContaining({
            to: "ada@example.com",
            replyToEmail: { threadId: "thread-1", messageId: "msg-1" },
          }),
        }),
      }),
    );
  });

  it("holds a send with files by its mailbox draft, never their bytes", async () => {
    vi.mocked(findScheduledEmail).mockResolvedValue(null);
    vi.mocked(holdEmailForUndo).mockImplementation(async ({ input, sendAt }) =>
      heldRow({ payload: input, sendAt }),
    );
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const operation = heldSendOperation(Date.now() + 30_000);
    if (operation.intent.kind !== "send") throw new Error("expected send");
    operation.intent.providerDraftId = "draft-1";

    const result = await executor.execute({
      operation,
      attemptId: "a-held-draft",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ status: "accepted" });
    const { input } = vi.mocked(holdEmailForUndo).mock.calls[0][0];
    expect(input.email.providerDraftId).toBe("draft-1");
    expect(input.email.attachments).toBeUndefined();
  });

  it("confirms a held send from its receipt once the server sent it", async () => {
    vi.mocked(findScheduledEmail).mockResolvedValue(
      heldRow({ status: "SENT" }),
    );
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      status: "SENT",
      result: { messageId: "sent-1", threadId: "thread-1" },
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });

    const result = await executor.inspect({
      operation: heldSendOperation(Date.now() - 1000),
      receiptId: null,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("confirmed");
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects a held send that was undone", async () => {
    vi.mocked(findScheduledEmail).mockResolvedValue(
      heldRow({ status: "CANCELLED" }),
    );
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });

    const result = await executor.inspect({
      operation: heldSendOperation(Date.now() + 10_000),
      receiptId: null,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      status: "rejected",
      code: "cancelled",
      targets: [],
    });
  });

  it.each([
    { outcome: "found", status: "confirmed" },
    { outcome: "missing", status: "rejected" },
    { outcome: "unavailable", status: "not_dispatched" },
  ])("verifies an omitted batch target individually ($outcome)", async ({
    outcome,
    status,
  }) => {
    const inbox = new Set(["m1", "m2"]);
    const message = (id: string) => ({
      id,
      threadId: "thread-1",
      headers: {},
      labelIds: inbox.has(id) ? ["INBOX"] : [],
    });
    const getMessage = vi.fn(async (id: string) => {
      if (id === "m2" && outcome === "missing")
        throw new Error("Requested entity was not found");
      if (id === "m2" && outcome === "unavailable")
        throw new Error("Provider unavailable");
      return message(id);
    });
    const archiveMessages = vi.fn(async (ids: string[]) => {
      for (const id of ids) inbox.delete(id);
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        getMessage,
        archiveMessages,
        async getMessagesBatch() {
          return [message("m1")];
        },
      } as unknown as EmailProvider,
    });
    if (outcome === "found") {
      vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
        created: true,
        snoozedThread: { id: "snooze", status: "PREPARING" },
      } as never);
      vi.mocked(activatePreparedSnoozedThread).mockResolvedValueOnce({
        status: "PENDING",
      } as never);
    } else {
      vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce(null);
    }
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const result = await executor.execute({
      operation: {
        ...metadataOperation(targets),
        intent: {
          kind: "metadata",
          targets,
          change: { kind: "snooze", untilMs: Date.now() + 60_000 },
        },
      },
      attemptId: "batch-lookup",
      signal: new AbortController().signal,
    });
    expect(getMessage).toHaveBeenCalledWith("m2");
    expect(result.status).toBe(status);
    if (outcome === "missing")
      expect(result).toMatchObject({ code: "not_found" });
    if (outcome === "found")
      expect(archiveMessages).toHaveBeenCalledWith(["m2"]);
    else expect(archiveMessages).not.toHaveBeenCalled();
  });

  it("waits for a conversation ID before archiving or scheduling a snooze", async () => {
    const getMessage = vi
      .fn()
      .mockRejectedValue(new Error("Temporary lookup failure"));
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        getMessage,
        archiveMessages,
      } as unknown as EmailProvider,
    });

    const result = await executor.execute({
      operation: snoozeOperation(Date.now() + 60_000),
      attemptId: "attempt-1",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      status: "not_dispatched",
      reason: "unavailable",
    });
    expect(prepareSnoozedThread).not.toHaveBeenCalled();
    expect(archiveMessages).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "the original pending snooze",
      status: "PENDING",
      expected: "confirmed",
    },
    {
      label: "the original completed snooze",
      status: "COMPLETED",
      expected: "confirmed",
    },
    {
      label: "a different target",
      status: "PENDING",
      messageId: "m2",
      expected: "rejected",
    },
    {
      label: "a different wake time",
      status: "PENDING",
      wakeTimeDelta: 60_000,
      expected: "rejected",
    },
    {
      label: "a legacy receipt without a payload hash",
      status: "PENDING",
      legacy: true,
      expected: "rejected",
    },
  ])("verifies $label when the provider message lookup fails", async ({
    status,
    messageId,
    wakeTimeDelta,
    legacy,
    expected,
  }) => {
    const untilMs = Date.now() + 60_000;
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: { status: "PENDING" },
    } as never);
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        getMessage: vi
          .fn()
          .mockRejectedValue(new Error("Requested entity was not found"))
          .mockResolvedValueOnce({ id: "m1", threadId: "thread-1" }),
      } as unknown as EmailProvider,
    });
    const signal = new AbortController().signal;
    await executor.execute({
      operation: snoozeOperation(untilMs),
      attemptId: "original-snooze",
      signal,
    });
    const [{ clientMutationPayloadHash }] =
      vi.mocked(prepareSnoozedThread).mock.calls[0];
    vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce({
      status,
      scheduledFor: new Date(untilMs + (wakeTimeDelta ?? 0)),
      clientMutationPayloadHash: legacy ? null : clientMutationPayloadHash,
    } as never);

    const result = await executor.inspect({
      operation: snoozeOperation(untilMs + (wakeTimeDelta ?? 0), messageId),
      receiptId: null,
      signal,
    });

    expect(result.status).toBe(expected);
    expect(archiveMessages).not.toHaveBeenCalled();
    expect(prepareSnoozedThread).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "schedules a wake for the verified archived target",
      expected: "confirmed",
    },
    {
      label: "restores just the archived target after the wake time",
      expired: true,
      expected: "rejected",
      restore: true,
    },
    {
      label:
        "restores the archive if the wake time passes during recovery reads",
      expiresDuringRead: true,
      expected: "rejected",
      restore: true,
    },
    {
      label: "rolls back an expired archive even while the inbox read is stale",
      expired: true,
      staleInbox: true,
      expected: "rejected",
      restore: true,
    },
    {
      label: "leaves archived mail alone before dispatch",
      expired: true,
      beforeArchive: true,
      expected: "rejected",
    },
    {
      label:
        "leaves a previously archived target alone after its conversation changes",
      moved: true,
      alreadyArchived: true,
      expected: "rejected",
    },
    {
      label: "keeps an unreadable target retryable",
      transientFailure: true,
      expected: "not_dispatched",
    },
    {
      label: "restores the original targets when a target moved",
      moved: true,
      expected: "rejected",
      restore: true,
    },
    {
      label:
        "restores the original targets when the entire conversation changed",
      moved: true,
      fullMove: true,
      expected: "rejected",
      restore: true,
    },
    {
      label: "preserves a different active snooze",
      competing: true,
      expected: "rejected",
    },
    {
      label: "confirms an already scheduled snooze after a target moved",
      moved: true,
      scheduled: true,
      expected: "confirmed",
    },
  ])("$label during snooze recovery", async ({
    expired,
    expiresDuringRead,
    staleInbox,
    beforeArchive,
    alreadyArchived,
    transientFailure,
    moved,
    fullMove,
    competing,
    scheduled,
    expected,
    restore,
  }) => {
    const receipt = {
      id: "snooze-row",
      status: "PREPARING",
      restoreMessageIds: [],
    };
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: true,
      snoozedThread: receipt,
    } as never);
    const interrupted = new Error("Interrupted after archive");
    if (beforeArchive) {
      vi.mocked(claimSnoozePreparation).mockResolvedValueOnce(null);
    } else if (scheduled) {
      vi.mocked(activatePreparedSnoozedThread).mockResolvedValueOnce({
        status: "PENDING",
      } as never);
    } else {
      vi.mocked(activatePreparedSnoozedThread).mockRejectedValueOnce(
        interrupted,
      );
    }
    prisma.snoozedThread.findMany.mockResolvedValue(
      competing ? ([{ threadId: "thread-1" }] as never) : [],
    );
    const inbox = new Set(alreadyArchived || beforeArchive ? [] : ["m2"]);
    const archiveMessages = vi.fn(async (ids: string[]) => {
      for (const id of ids) inbox.delete(id);
    });
    const unarchiveMessages = vi.fn();
    let replaying = false;
    let replayReads = 0;
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        unarchiveMessages,
        getMessagesBatch(this: EmailProvider, ids: string[]) {
          return Promise.all(ids.map((id) => this.getMessage(id)));
        },
        async getMessage(id: string) {
          if (replaying && !moved && id === "m1")
            throw new Error("Requested entity was not found");
          if (replaying && transientFailure && id === "m2")
            throw new Error("Provider unavailable");
          if (
            replaying &&
            expiresDuringRead &&
            id === "m2" &&
            ++replayReads === 2
          )
            clock?.mockReturnValue(untilMs + 1);
          return {
            id,
            threadId:
              replaying && moved && (fullMove || id === "m2")
                ? "thread-2"
                : "thread-1",
            headers: { from: "ada@example.com" },
            labelIds:
              inbox.has(id) || (replaying && staleInbox) ? ["INBOX"] : [],
          };
        },
      } as unknown as EmailProvider,
    });
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const untilMs = Date.now() + 60_000;
    const operation: PreparedOperation = {
      ...metadataOperation(targets),
      intent: {
        kind: "metadata",
        targets,
        change: {
          kind: "snooze",
          untilMs,
        },
      },
    };
    const signal = new AbortController().signal;
    const initial = executor.execute({
      operation,
      attemptId: "original-snooze",
      signal,
    });
    if (beforeArchive || scheduled) {
      await expect(initial).resolves.toHaveProperty(
        "status",
        beforeArchive ? "not_dispatched" : "confirmed",
      );
    } else {
      await expect(initial).rejects.toBe(interrupted);
    }
    if (!beforeArchive && !alreadyArchived)
      expect(archiveMessages).toHaveBeenCalledWith(["m2"]);
    const [mutation] = vi.mocked(prepareSnoozedThread).mock.calls[0];
    const restoreMessageIds = vi
      .mocked(updateSnoozeArchiveWrite)
      .mock.calls.flatMap(([write]) => write.restoreMessageIds ?? []);
    expect(restoreMessageIds).toEqual(
      alreadyArchived || beforeArchive ? [] : ["m2"],
    );
    archiveMessages.mockClear();
    vi.mocked(activatePreparedSnoozedThread).mockClear();
    if (expected === "confirmed" && !scheduled) {
      vi.mocked(activatePreparedSnoozedThread).mockResolvedValueOnce({
        status: "PENDING",
      } as never);
    }
    replaying = true;
    if (fullMove) {
      vi.mocked(prepareSnoozedThread).mockRejectedValueOnce(
        new SafeError(
          "Snooze mutation ID was reused with different input",
          409,
        ),
      );
    }
    vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce({
      ...mutation,
      id: "snooze-row",
      status: scheduled ? "PENDING" : "PREPARING",
      archiveStarted: !beforeArchive,
      restoreMessageIds: scheduled || beforeArchive ? [] : restoreMessageIds,
    } as never);

    const clock =
      expired || expiresDuringRead
        ? vi
            .spyOn(Date, "now")
            .mockReturnValue(expired ? untilMs + 1 : untilMs - 1)
        : undefined;
    const result = await executor
      .inspect({ operation, receiptId: null, signal })
      .finally(() => clock?.mockRestore());

    expect(result.status).toBe(expected);
    expect(archiveMessages).not.toHaveBeenCalled();
    if (restore)
      expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m2"]);
    else expect(unarchiveMessages).not.toHaveBeenCalled();
    if (expected === "confirmed" && !scheduled) {
      expect(activatePreparedSnoozedThread).toHaveBeenCalledWith(
        mutation,
        expect.any(Date),
        result.status === "confirmed" ? result.targets : undefined,
      );
      expect(result).toMatchObject({
        targets: [
          { outcome: "rejected", code: "not_found" },
          { outcome: "applied" },
        ],
      });
    } else {
      expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    }
    if (expected === "rejected") {
      expect(cancelSnoozedThreadByClientMutationId).toHaveBeenCalled();
    } else {
      expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
    }
  });

  it.each([
    { secondThreadId: "thread-1", expected: "confirmed" },
    { secondThreadId: "thread-2", expected: "rejected" },
    { secondThreadId: null, expected: "rejected" },
  ])("checks legacy snooze targets when the second message belongs to $secondThreadId", async ({
    secondThreadId,
    expected,
  }) => {
    if (expected === "confirmed") {
      vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
        created: false,
        snoozedThread: { status: "PENDING", clientMutationPayloadHash: null },
      } as never);
    }
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        getMessagesBatch(this: EmailProvider, ids: string[]) {
          return Promise.all(
            ids
              .filter((id) => id === "m1" || secondThreadId)
              .map((id) => this.getMessage(id)),
          );
        },
        async getMessage(id: string) {
          return { id, threadId: id === "m1" ? "thread-1" : secondThreadId };
        },
      } as unknown as EmailProvider,
    });
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const result = await executor.inspect({
      operation: {
        ...metadataOperation(targets),
        intent: {
          kind: "metadata",
          targets,
          change: { kind: "snooze", untilMs: Date.now() + 60_000 },
        },
      },
      receiptId: null,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe(expected);
    expect(archiveMessages).not.toHaveBeenCalled();
    expect(prepareSnoozedThread).toHaveBeenCalledTimes(
      expected === "confirmed" ? 1 : 0,
    );
  });

  it("finishes scheduling a preparing snooze during recovery", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: false,
      snoozedThread: { status: "PREPARING" },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValue({
      status: "PENDING",
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages: vi.fn(),
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: [],
          };
        },
      } as unknown as EmailProvider,
    });
    const untilMs = Date.now() + 60_000;
    const result = await executor.inspect({
      operation: snoozeOperation(untilMs),
      receiptId: null,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("confirmed");
    expect(activatePreparedSnoozedThread).toHaveBeenCalledWith(
      {
        clientMutationId: "bulk-1",
        clientMutationPayloadHash: expect.any(String),
        emailAccountId: "acc-1",
        threadId: "thread-1",
        scheduledFor: new Date(untilMs),
      },
      expect.any(Date),
      expect.arrayContaining([expect.objectContaining({ outcome: "applied" })]),
    );
  });

  it("transfers snooze ownership to the server scheduler after archive", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValue({} as never);
    let archived = false;
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveMessages() {
          archived = true;
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: archived ? [] : ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: {
        ...metadataOperation([{ accountId: "acc-1", messageId: "m1" }]),
        intent: {
          kind: "metadata",
          targets: [{ accountId: "acc-1", messageId: "m1" }],
          change: { kind: "snooze", untilMs: Date.now() + 60_000 },
        },
      },
      attemptId: "a-snooze",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(result.observations).toEqual([
      expect.objectContaining({
        kind: "message_patch",
        key: { accountId: "acc-1", messageId: "m1" },
        fields: expect.objectContaining({ roles: [] }),
      }),
    ]);
    expect(prepareSnoozedThread).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        threadId: "thread-1",
      }),
    );
    expect(activatePreparedSnoozedThread).toHaveBeenCalled();
    expect(claimSnoozePreparation).toHaveBeenCalled();
  });

  it.each([
    { expiresDuring: "readback", legacy: false },
    { expiresDuring: "marker", legacy: false },
    { expiresDuring: "readback", legacy: true },
  ])("restores only dispatched archives when the wake deadline passes during $expiresDuring (legacy: $legacy)", async ({
    expiresDuring,
    legacy,
  }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const untilMs = Date.now() + 5000;
      const inbox = new Set(["m1", "m2"]);
      const message = (id: string) => ({
        id,
        threadId: "thread-1",
        headers: {},
        labelIds: inbox.has(id) ? ["INBOX"] : [],
      });
      const archiveMessages = vi.fn(async (ids: string[]) => {
        for (const id of ids) inbox.delete(id);
      });
      const unarchiveMessages = vi.fn(async (ids: string[]) => {
        for (const id of ids) inbox.add(id);
      });
      const receipt = {
        id: "snooze-row",
        emailAccountId: "acc-1",
        threadId: "thread-1",
        status: "PREPARING",
        restoreMessageIds: [],
      };
      vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
        created: !legacy,
        snoozedThread: receipt,
      } as never);
      let persistedHash = legacy
        ? null
        : createHash("sha256")
            .update(JSON.stringify({ untilMs, messageIds: ["m1", "m2"] }))
            .digest("hex");
      let persistedRestoreIds: string[] = [];
      vi.mocked(claimSnoozePreparation).mockImplementationOnce(
        async (_, dispatch) => {
          persistedHash ??= dispatch?.clientMutationPayloadHash ?? null;
          return new Date();
        },
      );
      vi.mocked(getSnoozedThreadByClientMutationId).mockImplementationOnce(
        () =>
          Promise.resolve({
            ...receipt,
            archiveStarted: true,
            clientMutationPayloadHash: persistedHash,
            restoreMessageIds: persistedRestoreIds,
          }) as never,
      );
      prisma.snoozedThread.findMany.mockResolvedValue([]);
      const saveArchiveWrite = async ({
        messageId,
        restoreMessageIds,
      }: Parameters<typeof updateSnoozeArchiveWrite>[0]) => {
        if (restoreMessageIds) persistedRestoreIds = restoreMessageIds;
        if (expiresDuring === "marker" && messageId === "m2") {
          inbox.delete("m2");
          vi.setSystemTime(untilMs + 1);
        }
        return true;
      };
      vi.mocked(updateSnoozeArchiveWrite)
        .mockImplementationOnce(saveArchiveWrite)
        .mockImplementationOnce(saveArchiveWrite);
      if (expiresDuring === "marker")
        vi.mocked(updateSnoozeArchiveWrite)
          .mockImplementationOnce(saveArchiveWrite)
          .mockImplementationOnce(saveArchiveWrite);
      const executor = createEmailProviderOperationExecutor({
        accountId: "acc-1",
        provider: {
          name: "google",
          archiveMessages,
          unarchiveMessages,
          async getMessagesBatch(ids: string[]) {
            return ids.map(message);
          },
          async getMessage(id: string) {
            if (expiresDuring === "readback" && id === "m1" && !inbox.has(id)) {
              inbox.delete("m2");
              vi.setSystemTime(untilMs + 1);
            }
            return message(id);
          },
        } as unknown as EmailProvider,
      });
      const targets = ["m1", "m2"].map((messageId) => ({
        accountId: "acc-1",
        messageId,
      }));
      await expect(
        executor.execute({
          operation: {
            ...metadataOperation(targets),
            intent: {
              kind: "metadata",
              targets,
              change: { kind: "snooze", untilMs },
            },
          },
          attemptId: "archive-before-wake",
          signal: new AbortController().signal,
        }),
      ).resolves.toMatchObject({ status: "rejected", code: "snooze_expired" });
      expect(archiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
      expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
      expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
      expect(inbox).toEqual(new Set(["m1"]));
      if (expiresDuring === "marker")
        expect(updateSnoozeArchiveWrite).toHaveBeenCalledWith(
          expect.objectContaining({ previousMessageId: "m2", messageId: null }),
        );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the snooze retryable while the provider still shows the archived message in the inbox", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveMessages() {},
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: snoozeOperation(Date.now() + 60_000),
      attemptId: "a-snooze-not-applied",
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "not_dispatched",
      reason: "unavailable",
    });
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
  });

  it("rejects a fresh expired snooze before archiving", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: snoozeOperation(1),
      attemptId: "a-snooze-expired",
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "rejected",
      code: "snooze_expired",
    });
    expect(archiveMessages).not.toHaveBeenCalled();
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(cancelSnoozedThreadByClientMutationId).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMutationId: "bulk-1",
        emailAccountId: "acc-1",
      }),
    );
  });

  it("does not archive again when replaying an activated snooze", async () => {
    vi.mocked(getPendingSnoozeRollbackMessageIds).mockResolvedValue(
      new Set(["m1"]),
    );
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: false,
      snoozedThread: { status: "PENDING" },
    } as never);
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: snoozeOperation(Date.now() + 60_000),
      attemptId: "a-snooze-replay",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(archiveMessages).not.toHaveBeenCalled();
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(getPendingSnoozeRollbackMessageIds).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])("replays recorded per-target outcomes when provider lookup fails: %s", async (lookupFails) => {
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const untilMs = Date.now() + 60_000;
    const targetOutcomes = [
      { key: targets[0], outcome: "applied", code: null },
      { key: targets[1], outcome: "rejected", code: "not_applied" },
    ];
    const snoozedThread = {
      status: "PENDING",
      clientMutationPayloadHash: createHash("sha256")
        .update(JSON.stringify({ untilMs, messageIds: ["m1", "m2"] }))
        .digest("hex"),
      targetOutcomes,
    } as never;
    if (lookupFails)
      vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce(
        snoozedThread,
      );
    else
      vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
        created: false,
        snoozedThread,
      });
    const archiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        archiveMessages,
        async getMessagesBatch() {
          if (lookupFails) throw new Error("Provider unavailable");
          return targets.map(({ messageId }) => ({
            id: messageId,
            threadId: "thread-1",
          }));
        },
      } as unknown as EmailProvider,
    });
    await expect(
      executor.inspect({
        operation: {
          ...metadataOperation(targets),
          intent: {
            kind: "metadata",
            targets,
            change: { kind: "snooze", untilMs },
          },
        },
        receiptId: null,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: "confirmed", targets: targetOutcomes });
    expect(archiveMessages).not.toHaveBeenCalled();
  });

  it("keeps a competing snooze from starting while rollback is restoring the message", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: {
        id: "expired-snooze",
        status: "PREPARING",
        threadId: "thread-1",
        archiveStarted: true,
        restoreMessageIds: ["m1"],
      },
    } as never);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const restoring = Promise.withResolvers<void>();
    const finishRestore = Promise.withResolvers<void>();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessage(id: string) {
          return { id, threadId: "thread-1", headers: {}, labelIds: [] };
        },
        async unarchiveMessages() {
          restoring.resolve();
          await finishRestore.promise;
        },
      } as unknown as EmailProvider,
    });
    const signal = new AbortController().signal;
    const rollback = executor.inspect({
      operation: snoozeOperation(1),
      receiptId: null,
      signal,
    });
    await restoring.promise;
    try {
      const next = snoozeOperation(Date.now() + 60_000);
      await expect(
        executor.execute({
          operation: {
            ...next,
            key: { ...next.key, operationId: "new-snooze" },
          },
          attemptId: "competing-archive",
          signal,
        }),
      ).resolves.toMatchObject({ status: "not_dispatched" });
      expect(prepareSnoozedThread).toHaveBeenCalledTimes(1);
      expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    } finally {
      finishRestore.resolve();
      await expect(rollback).resolves.toMatchObject({ code: "snooze_expired" });
    }
  });

  it.each([
    "m1",
    "m2",
  ])("blocks a new snooze for %s in the conversation of a pending restore", async (messageId) => {
    const receipt = {
      id: "expired-snooze",
      status: "PREPARING",
      threadId: "thread-1",
      archiveStarted: true,
      restoreMessageIds: ["m1"],
    };
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: receipt,
    } as never);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    const pendingRollbackMessageIds = ["m1"];
    let inInbox = false;
    const archiveMessages = vi.fn();
    const getThread = vi
      .fn()
      .mockResolvedValue({ messages: [{ id: "m1" }, { id: "m2" }] });
    const unarchiveMessages = vi.fn(async () => {
      throw new Error("Timed out before acknowledging the restore");
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        unarchiveMessages,
        getThread,
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: {},
            labelIds: id === "m2" || inInbox ? ["INBOX"] : [],
          };
        },
      } as unknown as EmailProvider,
    });
    const signal = new AbortController().signal;
    const inspect = () =>
      executor.inspect({
        operation: snoozeOperation(1),
        receiptId: null,
        signal,
      });
    expect(await inspect()).toMatchObject({ status: "not_dispatched" });
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          pendingRollbackMessageIds,
          rollbackDispatchedAt: expect.any(Date),
          rollbackArchiveObservedIds: ["m1"],
        },
      }),
    );
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledBefore(
      unarchiveMessages,
    );
    vi.mocked(getPendingSnoozeRollbackMessageIds).mockResolvedValueOnce(
      new Set(pendingRollbackMessageIds),
    );
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const next = snoozeOperation(Date.now() + 60_000, messageId);
    expect(
      await executor.execute({
        operation: {
          ...next,
          key: { ...next.key, operationId: "next-snooze" },
        },
        attemptId: "next",
        signal,
      }),
    ).toMatchObject({ status: "not_dispatched" });
    expect(archiveMessages).not.toHaveBeenCalled();
    if (messageId === "m2")
      expect(getThread).toHaveBeenCalledExactlyOnceWith("thread-1", {
        complete: true,
      });
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();

    inInbox = true;
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: {
        ...receipt,
        pendingRollbackMessageIds,
        rollbackDispatchedAt: new Date(),
        rollbackArchiveObservedIds: ["m1"],
      },
    } as never);
    expect(await inspect()).toMatchObject({ code: "snooze_expired" });
    expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
  });

  it.each([
    false,
    true,
  ])("rechecks a stale pending rollback after its retry window (already in Inbox: %s)", async (inInbox) => {
    const rollbackDispatchedAt = new Date(
      Date.now() - SNOOZE_EXECUTION_LEASE_MS - 1000,
    );
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: {
        id: "stale-rollback",
        emailAccountId: "acc-1",
        threadId: "thread-1",
        status: "CANCELLED",
        restoreMessageIds: ["m1"],
        pendingRollbackMessageIds: ["m1"],
        rollbackDispatchedAt,
        rollbackArchiveObservedIds: [],
      },
    } as never);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    const unarchiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        unarchiveMessages,
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: {},
            labelIds: inInbox ? ["INBOX"] : [],
          };
        },
      } as unknown as EmailProvider,
    });
    await expect(
      executor.inspect({
        operation: snoozeOperation(1),
        receiptId: null,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: "rejected", code: "snooze_cancelled" });

    if (inInbox) {
      expect(unarchiveMessages).not.toHaveBeenCalled();
    } else {
      expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
      expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rollbackDispatchedAt }),
          data: expect.objectContaining({
            rollbackDispatchedAt: expect.any(Date),
          }),
        }),
      );
    }
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pendingRollbackMessageIds: [],
          rollbackDispatchedAt: null,
        }),
      }),
    );
  });

  it.each([
    { label: "recorded Inbox targets", restoreMessageIds: ["m1"] },
    { label: "no recorded Inbox targets", restoreMessageIds: [] },
  ])("expires a legacy snooze with $label", async ({ restoreMessageIds }) => {
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: {
        id: "legacy-snooze",
        emailAccountId: "acc-1",
        threadId: "thread-1",
        status: "PREPARING",
        clientMutationPayloadHash: null,
        archiveStarted: restoreMessageIds.length > 0,
        restoreMessageIds,
      },
    } as never);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    const archiveMessages = vi.fn();
    const unarchiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveMessages,
        unarchiveMessages,
        getMessagesBatch(this: EmailProvider, ids: string[]) {
          return Promise.all(ids.map((id) => this.getMessage(id)));
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const result = await executor.execute({
      operation: {
        ...metadataOperation(targets),
        intent: {
          kind: "metadata",
          targets,
          change: { kind: "snooze", untilMs: 1 },
        },
      },
      attemptId: "a-snooze-preparing-expired",
      signal: new AbortController().signal,
    });
    expect(archiveMessages).not.toHaveBeenCalled();
    if (restoreMessageIds.length) {
      expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
      expect(unarchiveMessages).toHaveBeenCalledBefore(
        vi.mocked(cancelSnoozedThreadByClientMutationId),
      );
    } else {
      expect(unarchiveMessages).not.toHaveBeenCalled();
    }
    expect(result).toMatchObject({
      status: "rejected",
      code: "snooze_expired",
    });
    expect(cancelSnoozedThreadByClientMutationId).toHaveBeenCalled();
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
  });

  it("keeps a preparing snooze when restore after wake time fails", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: {
        id: "legacy-snooze",
        emailAccountId: "acc-1",
        threadId: "thread-1",
        status: "PREPARING",
        clientMutationPayloadHash: null,
        archiveStarted: true,
        restoreMessageIds: ["m1"],
      },
    } as never);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveMessages() {},
        async unarchiveMessages() {
          throw new Error("unavailable");
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: snoozeOperation(1),
      attemptId: "a-snooze-restore-fail",
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "not_dispatched",
      reason: "unavailable",
    });
    expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
  });

  it("does not activate recovery while a verified snooze target is still in the inbox", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessagesBatch() {
          throw new Error("Batch unavailable");
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: id === "m1" ? ["INBOX"] : [],
          };
        },
      } as unknown as EmailProvider,
    });
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const untilMs = Date.now() + 60_000;
    vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce({
      id: "snooze-row",
      threadId: "thread-1",
      status: "PREPARING",
      archiveStarted: true,
      restoreMessageIds: ["m1"],
      clientMutationPayloadHash: createHash("sha256")
        .update(JSON.stringify({ untilMs, messageIds: ["m1", "m2"] }))
        .digest("hex"),
    } as never);
    const result = await executor.inspect({
      operation: {
        ...metadataOperation(targets),
        intent: {
          kind: "metadata",
          targets,
          change: { kind: "snooze", untilMs },
        },
      },
      receiptId: null,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({ status: "not_dispatched" });
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
  });

  it.each([
    {
      cancelled: false,
      read: "inbox",
      elapsedMs: SNOOZE_EXECUTION_LEASE_MS + 1,
    },
    {
      cancelled: true,
      read: "inbox",
      elapsedMs: SNOOZE_EXECUTION_LEASE_MS + 1,
    },
    { cancelled: false, read: "404", elapsedMs: 31 * 60 * 1000 },
    { cancelled: true, read: "404", elapsedMs: 31 * 60 * 1000 },
  ])("retains rollback for a late archive after $elapsedMs ms (cancelled: $cancelled, read: $read)", async ({
    cancelled,
    read,
    elapsedMs,
  }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = Date.now();
      const untilMs = now + 10_000;
      const receipt = {
        id: "snooze-row",
        emailAccountId: "acc-1",
        threadId: "thread-1",
        status: "PREPARING",
        archiveStarted: false,
        archiveClaimedAt: null as Date | null,
        pendingArchiveMessageId: null as string | null,
        pendingArchiveDispatchedAt: null as Date | null,
        restoreMessageIds: [] as string[],
      };
      const readReceipt = async () =>
        ({ created: false, snoozedThread: { ...receipt } }) as never;
      vi.mocked(prepareSnoozedThread)
        .mockImplementationOnce(readReceipt)
        .mockImplementationOnce(readReceipt)
        .mockImplementationOnce(readReceipt);
      if (read === "inbox")
        vi.mocked(prepareSnoozedThread).mockImplementationOnce(readReceipt);
      vi.mocked(claimSnoozePreparation)
        .mockImplementationOnce(async () => {
          receipt.archiveStarted = true;
          receipt.archiveClaimedAt = new Date();
          return receipt.archiveClaimedAt;
        })
        .mockResolvedValueOnce(null);
      vi.mocked(updateSnoozeArchiveWrite).mockImplementationOnce(
        async ({ messageId, restoreMessageIds }) => {
          receipt.pendingArchiveMessageId = messageId;
          receipt.pendingArchiveDispatchedAt = messageId ? new Date() : null;
          if (restoreMessageIds) receipt.restoreMessageIds = restoreMessageIds;
          return true;
        },
      );
      prisma.snoozedThread.findMany.mockResolvedValue([]);
      const archiveDispatched = Promise.withResolvers<void>();
      const archiveSettled = Promise.withResolvers<void>();
      let inInbox = true;
      let missing = false;
      const unarchiveMessages = vi.fn(async () => {
        inInbox = true;
      });
      const executor = createEmailProviderOperationExecutor({
        accountId: "acc-1",
        provider: {
          name: "google",
          unarchiveMessages,
          async archiveMessages() {
            archiveDispatched.resolve();
            await archiveSettled.promise;
            throw new Error(
              "Provider timed out before acknowledging the write",
            );
          },
          async getMessage(id: string) {
            if (missing) throw new Error("Requested entity was not found");
            return {
              id,
              threadId: receipt.threadId,
              headers: { from: "ada@example.com" },
              labelIds: inInbox ? ["INBOX"] : [],
            };
          },
        } as unknown as EmailProvider,
      });
      const operation = snoozeOperation(untilMs);
      const signal = new AbortController().signal;
      const pending = executor.execute({
        operation,
        attemptId: "archive",
        signal,
      });
      await archiveDispatched.promise;
      const inspect = () =>
        executor.inspect({ operation, receiptId: null, signal });
      vi.setSystemTime(untilMs + 1);
      try {
        expect(await inspect()).toMatchObject({ status: "not_dispatched" });
        expect(unarchiveMessages).not.toHaveBeenCalled();
        expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
      } finally {
        archiveSettled.resolve();
        await expect(pending).resolves.toMatchObject({
          status: "not_dispatched",
        });
      }
      expect(releaseSnoozePreparation).not.toHaveBeenCalled();
      expect(receipt.pendingArchiveMessageId).toBe("m1");
      if (cancelled) receipt.status = "CANCELLED";

      vi.setSystemTime(now + elapsedMs);
      if (read === "404") {
        missing = true;
        const [mutation] = vi.mocked(prepareSnoozedThread).mock.calls[0];
        vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce({
          ...mutation,
          ...receipt,
        } as never);
      }
      expect(await inspect()).toMatchObject({ status: "not_dispatched" });
      expect(unarchiveMessages).not.toHaveBeenCalled();
      expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
      inInbox = false;
      missing = false;
      if (cancelled)
        prisma.snoozedThread.updateMany.mockResolvedValueOnce({ count: 1 });
      expect(await inspect()).toMatchObject({
        status: "rejected",
        code: cancelled ? "snooze_cancelled" : "snooze_expired",
      });
      expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
      expect(inInbox).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { status: "PREPARING", pendingCommits: true, readError: false },
    { status: "CANCELLED", pendingCommits: true, readError: false },
    { status: "PREPARING", pendingCommits: false, readError: false },
    { status: "CANCELLED", pendingCommits: false, readError: false },
    { status: "PREPARING", pendingCommits: true, readError: true },
    { status: "CANCELLED", pendingCommits: true, readError: true },
  ])("recovers earlier archives on a $status receipt with a pending write (commits: $pendingCommits, initial read error: $readError)", async ({
    status,
    pendingCommits,
    readError,
  }) => {
    const receipt = {
      id: "snooze-row",
      emailAccountId: "acc-1",
      threadId: "thread-1",
      status,
      archiveStarted: true,
      archiveClaimedAt: null,
      pendingArchiveMessageId: "pending",
      pendingArchiveDispatchedAt: new Date(),
      restoreMessageIds: ["archived", "pending"],
    };
    const prepare = async () =>
      ({ created: false, snoozedThread: { ...receipt } }) as never;
    if (!readError)
      vi.mocked(prepareSnoozedThread)
        .mockImplementationOnce(prepare)
        .mockImplementationOnce(prepare);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    const archived = new Set(["archived"]);
    let pendingUnavailable = readError;
    const unarchiveMessages = vi.fn(async (ids: string[]) => {
      for (const id of ids) archived.delete(id);
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        unarchiveMessages,
        async getMessage(id: string) {
          if (id === "pending" && pendingUnavailable)
            throw new Error("Provider unavailable");
          return {
            id,
            threadId: "thread-1",
            headers: {},
            labelIds: archived.has(id) ? [] : ["INBOX"],
          };
        },
        getMessagesBatch(this: EmailProvider, ids: string[]) {
          return Promise.all(ids.map((id) => this.getMessage(id)));
        },
      } as unknown as EmailProvider,
    });
    const targets = ["archived", "pending"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const inspect = () =>
      executor.inspect({
        operation: {
          ...metadataOperation(targets),
          intent: {
            kind: "metadata",
            targets,
            change: { kind: "snooze", untilMs: 1 },
          },
        },
        receiptId: null,
        signal: new AbortController().signal,
      });

    if (pendingUnavailable) {
      const untilMs = 1;
      const pendingReceipt = () =>
        Promise.resolve({
          ...receipt,
          clientMutationPayloadHash: createHash("sha256")
            .update(
              JSON.stringify({ untilMs, messageIds: ["archived", "pending"] }),
            )
            .digest("hex"),
        }) as never;
      vi.mocked(getSnoozedThreadByClientMutationId)
        .mockImplementationOnce(pendingReceipt)
        .mockImplementationOnce(pendingReceipt);
    }
    expect(await inspect()).toMatchObject({ status: "not_dispatched" });
    expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["archived"]);
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pendingArchiveMessageId: "pending",
          restoreMessageIds: { equals: ["archived", "pending"] },
        }),
        data: {
          restoreMessageIds: ["pending"],
          pendingRollbackMessageIds: [],
          rollbackDispatchedAt: null,
          rollbackArchiveObservedIds: [],
        },
      }),
    );
    receipt.restoreMessageIds = ["pending"];
    expect(await inspect()).toMatchObject({ status: "not_dispatched" });
    expect(unarchiveMessages).toHaveBeenCalledTimes(1);
    expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();

    pendingUnavailable = false;
    if (pendingCommits) archived.add("pending");
    else
      receipt.pendingArchiveDispatchedAt = new Date(
        Date.now() - 2 * SNOOZE_EXECUTION_LEASE_MS - 1000,
      );
    vi.mocked(prepareSnoozedThread).mockImplementationOnce(prepare);
    expect(await inspect()).toMatchObject({
      status: "rejected",
      code: status === "CANCELLED" ? "snooze_cancelled" : "snooze_expired",
    });
    if (pendingCommits)
      expect(unarchiveMessages).toHaveBeenNthCalledWith(2, ["pending"]);
    else expect(unarchiveMessages).toHaveBeenCalledTimes(1);
  });

  it("verifies Outlook's archive destination before dispatch and saves it for verification", async () => {
    const receipt = {
      id: "snooze-row",
      status: "PREPARING",
      restoreMessageIds: [],
    };
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: false,
      snoozedThread: receipt,
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValueOnce({
      status: "PENDING",
    } as never);
    const folders = {
      archiveFolderId: "archive-folder",
      inboxFolderId: "inbox-folder",
    };
    const getSnoozeFolderIds = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(folders);
    let archived = false;
    const archiveMessages = vi.fn(async () => {
      archived = true;
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        archiveMessages,
        getSnoozeFolderIds,
        async getMessage(id: string) {
          return convertMessage(
            {
              id,
              conversationId: "thread-1",
              parentFolderId: archived
                ? folders.archiveFolderId
                : folders.inboxFolderId,
            },
            { inbox: folders.inboxFolderId },
          );
        },
      } as unknown as EmailProvider,
    });
    const operation = snoozeOperation(Date.now() + 60_000);
    const execute = (attemptId: string) =>
      executor.execute({
        operation,
        attemptId,
        signal: new AbortController().signal,
      });
    expect(await execute("unresolved")).toMatchObject({
      status: "not_dispatched",
    });
    expect(archiveMessages).not.toHaveBeenCalled();
    expect(claimSnoozePreparation).not.toHaveBeenCalled();

    expect(await execute("resolved")).toMatchObject({ status: "confirmed" });
    expect(archiveMessages).toHaveBeenCalledExactlyOnceWith(["m1"]);
    expect(claimSnoozePreparation).toHaveBeenCalledExactlyOnceWith(receipt, {
      clientMutationPayloadHash: expect.any(String),
      folders,
    });
    expect(claimSnoozePreparation).toHaveBeenCalledBefore(archiveMessages);
  });

  it.each([
    { status: "PREPARING", name: "google", savedFolders: false },
    { status: "CANCELLED", name: "google", savedFolders: false },
    { status: "PREPARING", name: "microsoft", savedFolders: false },
    { status: "CANCELLED", name: "microsoft", savedFolders: false },
    { status: "PREPARING", name: "microsoft", savedFolders: true },
    { status: "CANCELLED", name: "microsoft", savedFolders: true },
  ] as const)("preserves later mailbox moves during $status snooze rollback on $name", async ({
    status,
    name,
    savedFolders,
  }) => {
    const folderIds = {
      archive: "archive-folder",
      inbox: "inbox-folder",
      deleteditems: "trash-folder",
      junkemail: "spam-folder",
    };
    let archiveFolderKnown = name === "google";
    const getMessages = () =>
      ["archive", "trash", "spam", "custom"]
        .map((id) => {
          if (name === "microsoft") {
            return convertMessage(
              {
                id,
                conversationId: "thread-1",
                parentFolderId: `${id}-folder`,
                categories: id === "custom" ? ["ARCHIVE"] : [],
              },
              archiveFolderKnown ? folderIds : { ...folderIds, archive: "" },
            );
          }
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: ["trash", "spam"].includes(id) ? [id.toUpperCase()] : [],
          };
        })
        .filter(({ id }) => name === "microsoft" || id !== "custom");
    const messageIds = getMessages().map(({ id }) => id);
    const prepared = {
      created: false,
      snoozedThread: {
        id: "snooze-row",
        emailAccountId: "acc-1",
        threadId: "thread-1",
        status,
        archiveStarted: true,
        clientMutationPayloadHash: null,
        restoreMessageIds: messageIds,
        ...(savedFolders && {
          archiveFolderId: folderIds.archive,
          inboxFolderId: folderIds.inbox,
        }),
      },
    } as never;
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce(prepared);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    if (status === "CANCELLED") {
      prisma.snoozedThread.updateMany.mockResolvedValueOnce({ count: 1 });
    }
    const unarchiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name,
        unarchiveMessages,
        async getMessagesBatch() {
          return getMessages();
        },
        async getMessage(id: string) {
          return getMessages().find((message) => message.id === id);
        },
      } as unknown as EmailProvider,
    });
    const targets = messageIds.map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const inspect = () =>
      executor.inspect({
        operation: {
          ...metadataOperation(targets),
          intent: {
            kind: "metadata",
            targets,
            change: { kind: "snooze", untilMs: 1 },
          },
        },
        receiptId: null,
        signal: new AbortController().signal,
      });
    if (name === "microsoft" && !savedFolders) {
      expect(await inspect()).toMatchObject({ status: "not_dispatched" });
      expect(unarchiveMessages).not.toHaveBeenCalled();
      expect(cancelSnoozedThreadByClientMutationId).not.toHaveBeenCalled();
      expect(prisma.snoozedThread.updateMany).not.toHaveBeenCalled();
      archiveFolderKnown = true;
      vi.mocked(prepareSnoozedThread).mockResolvedValueOnce(prepared);
    }
    const result = await inspect();
    expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["archive"]);
    expect(result).toMatchObject({
      status: "rejected",
      code: status === "CANCELLED" ? "snooze_cancelled" : "snooze_expired",
    });
  });

  it("keeps a cancelled snooze rollback pending through a temporary 404", async () => {
    const receipt = {
      id: "cancelled-snooze",
      emailAccountId: "acc-1",
      status: "CANCELLED",
      restoreMessageIds: ["m1", "m2"],
    };
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: true,
      snoozedThread: {
        id: receipt.id,
        status: "PREPARING",
        restoreMessageIds: [],
      },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValueOnce(
      receipt as never,
    );
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    prisma.snoozedThread.updateMany.mockResolvedValueOnce({ count: 1 });
    const unarchiveMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("Provider unavailable"));
    const archived = new Set<string>();
    let firstMessageUnreadable = false;
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        unarchiveMessages,
        async archiveMessages(ids: string[]) {
          for (const id of ids) archived.add(id);
        },
        getMessagesBatch(this: EmailProvider, ids: string[]) {
          return Promise.all(
            ids
              .filter((id) => !firstMessageUnreadable || id !== "m1")
              .map((id) => this.getMessage(id)),
          );
        },
        async getMessage(id: string) {
          if (firstMessageUnreadable && id === "m1")
            throw new Error("Requested entity was not found");
          return {
            id,
            threadId: "thread-1",
            headers: { from: "ada@example.com" },
            labelIds: archived.has(id) ? [] : ["INBOX"],
          };
        },
      } as unknown as EmailProvider,
    });
    const targets = ["m1", "m2"].map((messageId) => ({
      accountId: "acc-1",
      messageId,
    }));
    const operation: PreparedOperation = {
      ...metadataOperation(targets),
      intent: {
        kind: "metadata",
        targets,
        change: { kind: "snooze", untilMs: Date.now() + 60_000 },
      },
    };
    const signal = new AbortController().signal;

    const first = await executor.execute({
      operation,
      attemptId: "a-snooze-cancel",
      signal,
    });
    expect(first).toMatchObject({
      status: "not_dispatched",
      reason: "unavailable",
    });
    expect(claimSnoozePreparation).toHaveBeenCalledWith(
      expect.objectContaining({ id: receipt.id }),
      { clientMutationPayloadHash: expect.any(String) },
    );
    expect(unarchiveMessages).toHaveBeenNthCalledWith(1, ["m1", "m2"]);
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledTimes(1);

    const [mutation] = vi.mocked(prepareSnoozedThread).mock.calls[0];
    firstMessageUnreadable = true;
    archived.delete("m2");
    const pendingRollback = {
      ...mutation,
      ...receipt,
      pendingRollbackMessageIds: ["m1", "m2"],
      rollbackDispatchedAt: new Date(),
      rollbackArchiveObservedIds: ["m1", "m2"],
    };
    vi.mocked(getSnoozedThreadByClientMutationId).mockResolvedValueOnce(
      pendingRollback as never,
    );

    const retry = await executor.inspect({
      operation,
      receiptId: null,
      signal,
    });
    expect(retry).toMatchObject({ status: "not_dispatched" });
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledTimes(1);
    expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1", "m2"]);

    firstMessageUnreadable = false;
    archived.delete("m1");
    vi.mocked(prepareSnoozedThread).mockResolvedValueOnce({
      created: false,
      snoozedThread: pendingRollback,
    } as never);
    expect(
      await executor.inspect({ operation, receiptId: null, signal }),
    ).toMatchObject({
      status: "rejected",
      code: "snooze_cancelled",
    });
    expect(unarchiveMessages).toHaveBeenCalledExactlyOnceWith(["m1", "m2"]);
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: receipt.id,
        status: "CANCELLED",
        archiveClaimedAt: null,
        pendingArchiveMessageId: null,
        restoreMessageIds: { equals: ["m1", "m2"] },
      },
      data: {
        restoreMessageIds: [],
        pendingRollbackMessageIds: [],
        rollbackDispatchedAt: null,
        rollbackArchiveObservedIds: [],
        archiveClaimedAt: null,
        pendingArchiveMessageId: null,
        pendingArchiveDispatchedAt: null,
      },
    });
  });
});

function metadataOperation(
  targets: Array<{ accountId: string; messageId: string }>,
): PreparedOperation {
  return {
    key: { accountId: "acc-1", operationId: "bulk-1" },
    session: { accountId: "acc-1", generation: "g1" },
    authority: "backend",
    payloadHash: "hash",
    intent: {
      kind: "metadata",
      targets,
      change: { kind: "archive" },
    },
  };
}

function discardOperation(
  messageIds: string[],
  draftId?: string,
): PreparedOperation {
  const targets = messageIds.map((messageId) => ({
    accountId: "acc-1",
    messageId,
  }));
  return {
    ...metadataOperation(targets),
    intent: {
      kind: "metadata",
      targets,
      change: { kind: "discard_draft", draftId },
    },
  };
}

function snoozeOperation(untilMs: number, messageId = "m1"): PreparedOperation {
  const targets = [{ accountId: "acc-1", messageId }];
  return {
    ...metadataOperation(targets),
    intent: {
      kind: "metadata",
      targets,
      change: { kind: "snooze", untilMs },
    },
  };
}

function sendOperation(
  providerDraftId?: string,
  reply?: { replyToMessageId: string; replyToConversationId: string },
): PreparedOperation {
  return {
    key: {
      accountId: "acc-1",
      operationId: "7f0c3b9e-2c1d-4d6e-9b2a-1f0e5d4c3b2a",
    },
    session: { accountId: "acc-1", generation: "g1" },
    authority: "backend",
    payloadHash: "hash",
    intent: {
      kind: "send",
      frozenDraftId: "d1",
      frozenDraftRevision: 1,
      to: ["ada@example.com"],
      cc: [],
      bcc: [],
      subject: "Hi",
      html: "<p>Hi</p>",
      quotedHtml: "",
      ...(providerDraftId ? { providerDraftId } : {}),
      replyToMessageId: reply?.replyToMessageId ?? null,
      replyToConversationId: reply?.replyToConversationId ?? null,
      queuedAtMs: Date.now(),
    },
  };
}

function heldSendOperation(sendAtMs: number): PreparedOperation {
  const operation = sendOperation(undefined, {
    replyToMessageId: "msg-1",
    replyToConversationId: "thread-1",
  });
  if (operation.intent.kind !== "send") throw new Error("expected send");
  return { ...operation, intent: { ...operation.intent, sendAtMs } };
}

function heldRow(overrides: Partial<ScheduledEmail> = {}): ScheduledEmail {
  const now = new Date();
  return {
    id: "held-1",
    draftMessageIds: [],
    createdAt: now,
    updatedAt: now,
    emailAccountId: "acc-1",
    clientMutationId: "7f0c3b9e-2c1d-4d6e-9b2a-1f0e5d4c3b2a",
    payloadHash: "hash",
    payload: {},
    threadId: "thread-1",
    sendAt: new Date(now.getTime() + 30_000),
    status: "PENDING",
    processingStartedAt: null,
    executionQueuedAt: null,
    sentAt: null,
    error: null,
    remindAt: null,
    reminderStatus: "NONE",
    reminderStartedAt: null,
    heldForUndo: true,
    ...overrides,
  };
}
