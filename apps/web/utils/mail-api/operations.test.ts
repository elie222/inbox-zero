import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createEmailProviderOperationExecutor } from "./operations";
import type { EmailProvider } from "@/utils/email/types";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import prisma from "@/utils/__mocks__/prisma";
import {
  activatePreparedSnoozedThread,
  prepareSnoozedThread,
} from "@/utils/snooze/scheduler";
import {
  createFileBlobStore,
  writeBlobMetadata,
} from "@inboxzero/mail-sqlite/blob-store";
import {
  accountMailUploadDirectory,
  UPLOAD_BLOB_GRACE_MS,
} from "./upload-blobs";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/durable-email-send", () => ({
  executeDurableEmailSend: vi.fn(),
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
  });

  it("collects old unreferenced uploads after a confirmed send", async () => {
    const store = await stageAccountBlob("acc-1", "blob-send");
    await stageAccountBlob("acc-1", "orphan-old");
    const nowMs = Date.now();
    await utimes(
      join(accountMailUploadDirectory("acc-1"), "orphan-old"),
      new Date(nowMs - UPLOAD_BLOB_GRACE_MS - 1000),
      new Date(nowMs - UPLOAD_BLOB_GRACE_MS - 1000),
    );
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-gc", threadId: "t-gc" },
    });
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: { name: "google" } as unknown as EmailProvider,
    });
    const result = await executor.execute({
      operation: sendOperation(["blob-send"]),
      attemptId: "a-send-gc",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    expect(await store.read("blob-send")).toBeNull();
    expect(await store.read("orphan-old")).toBeNull();
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

  it("transfers snooze ownership to the server scheduler after archive", async () => {
    vi.mocked(prepareSnoozedThread).mockResolvedValue({
      created: true,
      snoozedThread: { status: "PREPARING" },
    } as never);
    vi.mocked(activatePreparedSnoozedThread).mockResolvedValue({} as never);
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
    expect(prepareSnoozedThread).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        threadId: "thread-1",
      }),
    );
    expect(activatePreparedSnoozedThread).toHaveBeenCalled();
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
