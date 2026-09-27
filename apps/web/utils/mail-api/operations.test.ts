import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createEmailProviderOperationExecutor } from "./operations";
import type { EmailProvider } from "@/utils/email/types";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import prisma from "@/utils/__mocks__/prisma";
import {
  activatePreparedSnoozedThread,
  cancelSnoozedThreadByClientMutationId,
  prepareSnoozedThread,
} from "@/utils/snooze/scheduler";
import {
  createFileBlobStore,
  writeBlobMetadata,
} from "@inboxzero/mail-sqlite/blob-store";
import {
  accountMailUploadDirectory,
  cancelAccountUpload,
} from "./upload-blobs";
import {
  findScheduledEmail,
  holdEmailForUndo,
} from "@/utils/scheduled-email/service";
import type { ScheduledEmail } from "@/generated/prisma/client";

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
vi.mock("@/utils/snooze/scheduler", () => ({
  prepareSnoozedThread: vi.fn(),
  activatePreparedSnoozedThread: vi.fn(),
  cancelSnoozedThreadByClientMutationId: vi.fn(),
}));

describe("createEmailProviderOperationExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("records per-target applied and rejected outcomes in one bulk archive", async () => {
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
      operation: sendOperation([], undefined, {
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
      operation: sendOperation([], "gmail-draft-1"),
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

  it("loads staged blob attachments into the durable send payload", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const directory = accountMailUploadDirectory("acc-1");
    await mkdir(directory, { recursive: true });
    const store = createFileBlobStore(directory);
    const checksum = createHash("sha256").update(png).digest("hex");
    await store.stage({
      blobId: "blob-1",
      bytes: (async function* () {
        yield png;
      })(),
      checksum,
      sizeBytes: png.byteLength,
    });
    await store.finalize("blob-1");
    await writeBlobMetadata(directory, "blob-1", {
      filename: "dot.png",
      contentType: "image/png",
    });
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-2", threadId: "t-2" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(["blob-1"]),
      attemptId: "a-send-attach",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(await store.read("blob-1")).toBeNull();
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: ["blob-1"],
        input: expect.objectContaining({
          email: expect.objectContaining({
            attachments: [
              expect.objectContaining({
                filename: "dot.png",
                contentType: "image/png",
                content: png.toString("base64"),
              }),
            ],
          }),
        }),
      }),
    );
  });

  it("rejects a send before provider dispatch when a requested attachment blob is missing", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(["missing-blob"]),
      attemptId: "a-send-missing-attachment",
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "rejected",
      code: "missing_attachment",
      targets: [],
    });
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("keeps staged blobs when send is still uncertain", async () => {
    const store = await stageAccountBlob("acc-1", "blob-hold");
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "uncertain",
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(["blob-hold"]),
      attemptId: "a-send-hold",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("uncertain");
    expect(await store.read("blob-hold")).not.toBeNull();
    expect(await cancelAccountUpload("acc-1", "blob-hold")).toEqual({
      status: "deleted",
      blobId: "blob-hold",
    });
  });

  it("refuses cancel of a blob while send execute still needs it", async () => {
    const store = await stageAccountBlob("acc-1", "blob-live");
    vi.mocked(executeDurableEmailSend).mockImplementation(async () => {
      expect(await cancelAccountUpload("acc-1", "blob-live")).toEqual({
        status: "in_use",
        blobId: "blob-live",
      });
      expect(await store.read("blob-live")).not.toBeNull();
      return {
        status: "applied",
        result: { messageId: "sent-live", threadId: "t-live" },
      };
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(["blob-live"]),
      attemptId: "a-send-live",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(await store.read("blob-live")).toBeNull();
    expect(await cancelAccountUpload("acc-1", "blob-live")).toEqual({
      status: "deleted",
      blobId: "blob-live",
    });
  });

  it("drops the hold when send execute throws", async () => {
    await stageAccountBlob("acc-1", "blob-throw");
    vi.mocked(executeDurableEmailSend).mockRejectedValue(
      new Error("provider down"),
    );
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    await expect(
      executor.execute({
        operation: sendOperation(["blob-throw"]),
        attemptId: "a-send-throw",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("provider down");
    expect(await cancelAccountUpload("acc-1", "blob-throw")).toEqual({
      status: "deleted",
      blobId: "blob-throw",
    });
  });

  it("does not delete a sibling staged upload when another send confirms", async () => {
    const store = await stageAccountBlob("acc-1", "blob-send");
    await stageAccountBlob("acc-1", "blob-sibling");
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-keep", threadId: "t-keep" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(["blob-send"]),
      attemptId: "a-send-keep",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(await store.read("blob-send")).toBeNull();
    expect(await store.read("blob-sibling")).not.toBeNull();
  });

  it("deletes staged blobs when inspect confirms a send", async () => {
    const store = await stageAccountBlob("acc-1", "blob-inspect");
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      status: "SENT",
      result: { messageId: "sent-3" },
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.inspect({
      operation: sendOperation(["blob-inspect"]),
      receiptId: "receipt",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(await store.read("blob-inspect")).toBeNull();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
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
        async archiveThreadWithLabel() {
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
  });

  it("does not activate a snooze when the provider still reports the message in the inbox after archive", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveThreadWithLabel() {},
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
      status: "rejected",
      code: "snooze_failed",
      targets: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          outcome: "rejected",
          code: "not_applied",
        },
      ],
    });
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(cancelSnoozedThreadByClientMutationId).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMutationId: "bulk-1",
        emailAccountId: "acc-1",
      }),
    );
  });

  it("rejects a fresh expired snooze before archiving", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const archiveThreadWithLabel = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveThreadWithLabel,
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
    expect(archiveThreadWithLabel).not.toHaveBeenCalled();
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
    expect(cancelSnoozedThreadByClientMutationId).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMutationId: "bulk-1",
        emailAccountId: "acc-1",
      }),
    );
  });

  it("does not archive again when replaying an activated snooze", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: false,
      snoozedThread: { status: "PENDING" },
    } as never);
    const archiveThreadWithLabel = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveThreadWithLabel,
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
    expect(archiveThreadWithLabel).not.toHaveBeenCalled();
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
  });

  it("restores mail when replaying a preparing snooze after its wake time", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: false,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const archiveThreadWithLabel = vi.fn();
    const unarchiveMessages = vi.fn();
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        archiveThreadWithLabel,
        unarchiveMessages,
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
      attemptId: "a-snooze-preparing-expired",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(archiveThreadWithLabel).not.toHaveBeenCalled();
    expect(unarchiveMessages).toHaveBeenCalledWith(["m1"]);
    expect(unarchiveMessages).toHaveBeenCalledBefore(
      cancelSnoozedThreadByClientMutationId,
    );
    expect(activatePreparedSnoozedThread).not.toHaveBeenCalled();
  });

  it("keeps a preparing snooze when restore after wake time fails", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: false,
      snoozedThread: { status: "PREPARING" },
    } as never);
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveThreadWithLabel() {},
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

  it("restores mail when activate reports the snooze was cancelled", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValue({
      status: "CANCELLED",
    } as never);
    const unarchiveMessages = vi.fn();
    let archived = false;
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveThreadWithLabel() {
          archived = true;
        },
        unarchiveMessages,
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
      operation: snoozeOperation(Date.now() + 60_000),
      attemptId: "a-snooze-cancel",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(unarchiveMessages).toHaveBeenCalledWith(["m1"]);
  });

  it("does not confirm a cancelled snooze until restore succeeds", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValue({
      status: "CANCELLED",
    } as never);
    let archived = false;
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveThreadWithLabel() {
          archived = true;
        },
        async unarchiveMessages() {
          throw new Error("unavailable");
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
      operation: snoozeOperation(Date.now() + 60_000),
      attemptId: "a-snooze-cancel-restore-fail",
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "not_dispatched",
      reason: "unavailable",
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

function snoozeOperation(untilMs: number): PreparedOperation {
  return {
    ...metadataOperation([{ accountId: "acc-1", messageId: "m1" }]),
    intent: {
      kind: "metadata",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "snooze", untilMs },
    },
  };
}

function sendOperation(
  attachmentIds: string[] = [],
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
      attachmentIds,
      ...(providerDraftId ? { providerDraftId } : {}),
      replyToMessageId: reply?.replyToMessageId ?? null,
      replyToConversationId: reply?.replyToConversationId ?? null,
      queuedAtMs: Date.now(),
    },
  };
}

function heldSendOperation(sendAtMs: number): PreparedOperation {
  const operation = sendOperation([], undefined, {
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

async function stageAccountBlob(accountId: string, blobId: string) {
  const png = Buffer.from("blob", "utf8");
  const directory = accountMailUploadDirectory(accountId);
  await mkdir(directory, { recursive: true });
  const store = createFileBlobStore(directory);
  const checksum = createHash("sha256").update(png).digest("hex");
  expect(
    await store.stage({
      blobId,
      bytes: (async function* () {
        yield png;
      })(),
      checksum,
      sizeBytes: png.byteLength,
    }),
  ).toEqual({ status: "staged" });
  expect(await store.finalize(blobId)).toMatchObject({ blobId });
  return store;
}
