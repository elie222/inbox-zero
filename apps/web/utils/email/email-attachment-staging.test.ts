import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailSendAttachmentStageStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  cleanupEmailAttachmentStages,
  completeEmailAttachments,
  EmailAttachmentStageConflictError,
  EmailAttachmentStageUnavailableError,
  executeStagedDurableEmailSend,
  stageEmailAttachments,
} from "./email-attachment-staging";

const blob = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));
const executeDurableEmailSend = vi.hoisted(() => vi.fn());
const mockedEnv = vi.hoisted(() => ({
  BLOB_READ_WRITE_TOKEN: undefined as string | undefined,
  BLOB_STORE_ID: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: mockedEnv }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/durable-email-send", () => ({
  DURABLE_EMAIL_PROCESSING_LEASE_MS: 2 * 60 * 1000,
  executeDurableEmailSend,
}));
vi.mock("@vercel/blob", () => ({
  ...blob,
  BlobNotFoundError: class BlobNotFoundError extends Error {},
}));

describe("email attachment staging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnv.BLOB_READ_WRITE_TOKEN = "blob-token";
    mockedEnv.BLOB_STORE_ID = undefined;
    delete process.env.VERCEL;
    prisma.$queryRaw.mockResolvedValue([
      {
        reservation: {
          outcome: "reserved",
          operationIsTerminal: false,
          recoverPendingIds: [],
          stageIds: ["stage-1"],
        },
      },
    ]);
    prisma.emailSendOperation.findUnique.mockResolvedValue(null);
    prisma.emailSendOperation.findMany.mockResolvedValue([]);
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([]);
    prisma.emailSendAttachmentStage.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { size: null },
    } as never);
    blob.issueSignedToken.mockResolvedValue({
      clientSigningToken: "signing",
      delegationToken: "delegation",
      validUntil: NOW.getTime() + 600_000,
    });
    blob.presignUrl.mockResolvedValue({
      presignedUrl:
        "https://store.private.blob.vercel-storage.com/upload?signature=secret",
    });
    blob.del.mockResolvedValue(undefined);
  });

  it("uses direct multipart only for a self-host without Blob credentials", async () => {
    mockedEnv.BLOB_READ_WRITE_TOKEN = undefined;

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
      }),
    ).resolves.toEqual({ mode: "direct" });
    expect(prisma.emailSendAttachmentStage.findMany).not.toHaveBeenCalled();
  });

  it("fails closed on Vercel when private Blob is not configured", async () => {
    mockedEnv.BLOB_READ_WRITE_TOKEN = undefined;
    process.env.VERCEL = "1";

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
      }),
    ).rejects.toBeInstanceOf(EmailAttachmentStageUnavailableError);
  });

  it("lets the Blob SDK resolve request-scoped OIDC credentials", async () => {
    mockedEnv.BLOB_READ_WRITE_TOKEN = undefined;
    mockedEnv.BLOB_STORE_ID = "store-1";
    process.env.VERCEL = "1";
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([stageRow()]);

    await stageEmailAttachments({
      emailAccountId: "account-1",
      input: stageInput(),
      now: NOW,
    });

    const options = blob.issueSignedToken.mock.calls[0][0];
    expect(options).toMatchObject({ storeId: "store-1" });
    expect(options).not.toHaveProperty("oidcToken");
  });

  it("creates a server-owned intent and an exact private PUT URL", async () => {
    const created = stageRow();
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([created]);

    const result = await stageEmailAttachments({
      emailAccountId: "account-1",
      input: stageInput(),
      now: NOW,
    });

    expect(result).toEqual({
      mode: "staged",
      attachments: [
        {
          id: "attachment-1",
          stageId: "stage-1",
          status: "upload_required",
          uploadUrl:
            "https://store.private.blob.vercel-storage.com/upload?signature=secret",
          uploadExpiresAt: NOW.getTime() + 600_000,
        },
      ],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(blob.issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: ["put"],
        pathname: created.pathname,
        allowedContentTypes: ["text/plain"],
        maximumSizeInBytes: 5,
      }),
    );
    expect(blob.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        access: "private",
        operation: "put",
        pathname: created.pathname,
        allowOverwrite: false,
        addRandomSuffix: false,
      }),
    );
  });

  it("rejects reuse of an attachment ID with changed metadata", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { reservation: { outcome: "metadata_changed" } },
    ]);

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(EmailAttachmentStageConflictError);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });

  it("enforces an account-level live staging quota", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { reservation: { outcome: "quota_exceeded" } },
    ]);

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
        now: NOW,
      }),
    ).rejects.toThrow("Too many attachments are waiting to send.");
  });

  it("deletes stale bytes before asking the client to reserve again", async () => {
    const stale = stageRow({
      status: EmailSendAttachmentStageStatus.DELETE_PENDING,
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        reservation: {
          outcome: "cleanup_required",
          cleanupIds: [stale.id],
        },
      },
    ]);
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([stale]);

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
        now: NOW,
      }),
    ).rejects.toThrow("Attachment storage is being refreshed");
    expect(blob.del).toHaveBeenCalledWith(stale.pathname, expect.anything());
  });

  it("releases a stale pre-provider claim before safely restaging", async () => {
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([
      stageRow({ pathname: "mail-attachments/new", status: "PENDING" }),
    ]);

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
        now: NOW,
      }),
    ).resolves.toMatchObject({ mode: "staged" });
    expect(blob.issueSignedToken).toHaveBeenCalledOnce();
  });

  it("scopes completion to the authenticated account and mutation", async () => {
    await expect(
      completeEmailAttachments({
        emailAccountId: "other-account",
        input: completeInput(),
      }),
    ).rejects.toThrow("staging reference is invalid");
    expect(blob.head).not.toHaveBeenCalled();
  });

  it("HEAD-verifies exact metadata before marking an upload ready", async () => {
    const pending = stageRow();
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([pending]);
    blob.head.mockResolvedValue({
      pathname: pending.pathname,
      size: pending.size,
      contentType: pending.mimeType,
      etag: "etag-1",
    });

    await expect(
      completeEmailAttachments({
        emailAccountId: "account-1",
        input: completeInput(),
      }),
    ).resolves.toEqual({
      attachments: [
        { id: "attachment-1", stageId: "stage-1", status: "ready" },
      ],
    });
    expect(blob.head).toHaveBeenCalledWith(
      pending.pathname,
      expect.objectContaining({ token: "blob-token" }),
    );
    expect(prisma.emailSendAttachmentStage.update).toHaveBeenCalledWith({
      where: { id: pending.id },
      data: {
        status: EmailSendAttachmentStageStatus.READY,
        etag: "etag-1",
      },
    });
  });

  it("recognizes a completed PENDING upload after a lost client response", async () => {
    const pending = stageRow();
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([pending]);
    prisma.$queryRaw.mockResolvedValue([
      {
        reservation: {
          outcome: "reserved",
          operationIsTerminal: false,
          recoverPendingIds: [pending.id],
          stageIds: [pending.id],
        },
      },
    ]);
    blob.head.mockResolvedValue({
      pathname: pending.pathname,
      size: pending.size,
      contentType: pending.mimeType,
      etag: "etag-recovered",
    });
    prisma.emailSendAttachmentStage.update.mockResolvedValue(
      stageRow({
        status: EmailSendAttachmentStageStatus.READY,
        etag: "etag-recovered",
      }),
    );

    await expect(
      stageEmailAttachments({
        emailAccountId: "account-1",
        input: stageInput(),
        now: NOW,
      }),
    ).resolves.toEqual({
      mode: "staged",
      attachments: [
        { id: "attachment-1", stageId: "stage-1", status: "ready" },
      ],
    });
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });

  it("materializes verified private bytes only inside the winning operation", async () => {
    const ready = stageRow({
      status: EmailSendAttachmentStageStatus.READY,
      etag: "etag-1",
    });
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([ready]);
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: byteStream("hello"),
      blob: {
        pathname: ready.pathname,
        etag: "etag-1",
        size: 5,
        contentType: "text/plain",
      },
    });
    executeDurableEmailSend.mockImplementationOnce(async (options) => ({
      status: "applied",
      prepared: await options.prepareEmail(),
    }));

    const result = await executeStagedDurableEmailSend({
      emailAccountId: "account-1",
      getEmailProvider: vi.fn(),
      input: sendInput(),
      provider: "google",
    });

    expect(result).toMatchObject({
      status: "applied",
      prepared: {
        attachments: [
          expect.objectContaining({
            content: "aGVsbG8=",
            contentType: "text/plain",
          }),
        ],
      },
    });
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadHashInput: expect.stringContaining("etag-1"),
        prepareEmail: expect.any(Function),
      }),
    );
    expect(blob.del).not.toHaveBeenCalled();
    expect(prisma.emailSendAttachmentStage.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [ready.id] },
        status: EmailSendAttachmentStageStatus.READY,
      },
      data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
    });
  });

  it("invalidates and deletes bytes that change during materialization", async () => {
    const ready = stageRow({
      status: EmailSendAttachmentStageStatus.READY,
      etag: "etag-1",
    });
    const oversized = cancellableByteStream("longer");
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([ready]);
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: oversized.stream,
      blob: {
        pathname: ready.pathname,
        etag: "etag-1",
        size: 5,
        contentType: "text/plain",
      },
    });
    executeDurableEmailSend.mockImplementationOnce(async (options) => {
      try {
        await options.prepareEmail();
        return { status: "applied" };
      } catch {
        return { status: "retry" };
      }
    });

    await expect(
      executeStagedDurableEmailSend({
        emailAccountId: "account-1",
        getEmailProvider: vi.fn(),
        input: sendInput(),
        provider: "google",
      }),
    ).resolves.toEqual({
      status: "retry",
      retryReason: "attachment_staging_invalid",
    });
    expect(prisma.emailSendAttachmentStage.updateMany).toHaveBeenCalledWith({
      where: { id: ready.id },
      data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
    });
    expect(blob.del).toHaveBeenCalledWith(
      ready.pathname,
      expect.objectContaining({ ifMatch: "etag-1" }),
    );
    expect(oversized.cancel).toHaveBeenCalledOnce();
  });

  it("cancels a truncated Blob read before retrying", async () => {
    const ready = stageRow({
      status: EmailSendAttachmentStageStatus.READY,
      etag: "etag-1",
    });
    const truncated = readerStream("hi");
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([ready]);
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: truncated.stream,
      blob: {
        pathname: ready.pathname,
        etag: "etag-1",
        size: 5,
        contentType: "text/plain",
      },
    });
    executeDurableEmailSend.mockImplementationOnce(async (options) => {
      try {
        await options.prepareEmail();
        return { status: "applied" };
      } catch {
        return { status: "retry" };
      }
    });

    await expect(
      executeStagedDurableEmailSend({
        emailAccountId: "account-1",
        getEmailProvider: vi.fn(),
        input: sendInput(),
        provider: "google",
      }),
    ).resolves.toEqual({
      status: "retry",
      retryReason: "attachment_staging_invalid",
    });
    expect(truncated.cancel).toHaveBeenCalledOnce();
    expect(truncated.releaseLock).toHaveBeenCalledOnce();
  });

  it("does no Blob read when the durable executor reports a replay", async () => {
    const deleted = stageRow({
      status: EmailSendAttachmentStageStatus.DELETED,
      etag: "etag-1",
    });
    prisma.emailSendAttachmentStage.findMany.mockResolvedValue([deleted]);
    executeDurableEmailSend.mockResolvedValue({ status: "already_applied" });

    await expect(
      executeStagedDurableEmailSend({
        emailAccountId: "account-1",
        getEmailProvider: vi.fn(),
        input: sendInput(),
        provider: "google",
      }),
    ).resolves.toEqual({ status: "already_applied" });
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("retries cleanup and retains tombstones for durable replay", async () => {
    const expired = stageRow({ expiresAt: new Date(NOW.getTime() - 1) });
    const pendingDelete = stageRow({
      id: "stage-2",
      attachmentId: "attachment-2",
      status: EmailSendAttachmentStageStatus.DELETE_PENDING,
    });
    prisma.emailSendAttachmentStage.findMany
      .mockResolvedValueOnce([expired])
      .mockResolvedValueOnce([pendingDelete])
      .mockResolvedValueOnce([
        stageRow({
          id: "old-tombstone-1",
          status: EmailSendAttachmentStageStatus.DELETED,
        }),
        stageRow({
          id: "old-tombstone-2",
          status: EmailSendAttachmentStageStatus.DELETED,
        }),
        stageRow({
          id: "old-tombstone-3",
          status: EmailSendAttachmentStageStatus.DELETED,
        }),
      ]);
    prisma.emailSendAttachmentStage.deleteMany.mockResolvedValue({ count: 3 });

    await expect(cleanupEmailAttachmentStages(NOW)).resolves.toEqual({
      deletedBlobs: 2,
      deletedTombstones: 3,
    });
    expect(blob.del).toHaveBeenCalledTimes(2);
    expect(prisma.emailSendAttachmentStage.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["old-tombstone-1", "old-tombstone-2", "old-tombstone-3"],
        },
      },
    });
  });

  it("sweeps terminal crash-window blobs but preserves active processing", async () => {
    const terminal = stageRow({ id: "terminal-stage" });
    const processing = stageRow({
      id: "processing-stage",
      attachmentId: "processing-attachment",
      mutationId: "processing-mutation",
      pathname: "mail-attachments/fedcba9876543210fedcba9876543210",
      expiresAt: new Date(NOW.getTime() - 1),
    });
    prisma.emailSendAttachmentStage.findMany
      .mockResolvedValueOnce([terminal, processing])
      .mockResolvedValueOnce([]);
    prisma.emailSendOperation.findMany.mockResolvedValue([
      {
        emailAccountId: "account-1",
        clientMutationId: MUTATION_ID,
        status: "SENT",
      },
      {
        emailAccountId: "account-1",
        clientMutationId: "processing-mutation",
        status: "PROCESSING",
      },
    ] as never);
    prisma.emailSendAttachmentStage.deleteMany.mockResolvedValue({ count: 0 });

    await cleanupEmailAttachmentStages(NOW);

    expect(prisma.emailSendAttachmentStage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["terminal-stage"] } },
      data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
    });
    expect(blob.del).toHaveBeenCalledWith(terminal.pathname, expect.anything());
    expect(blob.del).not.toHaveBeenCalledWith(
      processing.pathname,
      expect.anything(),
    );
  });

  it("releases stale pre-provider claims before cleaning expired bytes", async () => {
    const expired = stageRow({ expiresAt: new Date(NOW.getTime() - 1) });
    prisma.emailSendAttachmentStage.findMany
      .mockResolvedValueOnce([expired])
      .mockResolvedValueOnce([]);
    prisma.emailSendOperation.findMany.mockResolvedValue([
      {
        id: "operation-1",
        emailAccountId: "account-1",
        clientMutationId: MUTATION_ID,
        processingStartedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
        providerStartedAt: null,
        status: "PROCESSING",
      },
    ] as never);
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 1 });
    prisma.emailSendAttachmentStage.deleteMany.mockResolvedValue({ count: 0 });

    await cleanupEmailAttachmentStages(NOW);

    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "operation-1",
        providerStartedAt: null,
      }),
    });
    expect(blob.del).toHaveBeenCalledWith(expired.pathname, expect.anything());
  });
});

const MUTATION_ID = "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf";
const NOW = new Date("2026-08-26T12:00:00.000Z");

function stageInput() {
  return {
    mutationId: MUTATION_ID,
    queuedAt: NOW.getTime(),
    attachments: [attachmentMetadata()],
  };
}

function completeInput() {
  return {
    mutationId: MUTATION_ID,
    attachments: [{ id: "attachment-1", stageId: "stage-1" }],
  };
}

function sendInput() {
  return {
    mutationId: MUTATION_ID,
    queuedAt: NOW.getTime(),
    threadId: "thread-1",
    messageIds: ["message-1"],
    email: {
      to: "recipient@example.com",
      subject: "Re: Hello",
      messageHtml: "<p>Hello</p>",
      attachments: [{ ...attachmentMetadata(), stagedAttachmentId: "stage-1" }],
    },
  };
}

function attachmentMetadata() {
  return {
    id: "attachment-1",
    filename: "notes.txt",
    mimeType: "text/plain",
    size: 5,
    disposition: "attachment" as const,
  };
}

function stageRow(overrides = {}) {
  return {
    id: "stage-1",
    createdAt: NOW,
    updatedAt: NOW,
    mutationId: MUTATION_ID,
    attachmentId: "attachment-1",
    pathname: "mail-attachments/0123456789abcdef0123456789abcdef",
    filename: "notes.txt",
    mimeType: "text/plain",
    size: 5,
    disposition: "attachment",
    contentId: null,
    status: EmailSendAttachmentStageStatus.PENDING,
    etag: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    deletedAt: null,
    emailAccountId: "account-1",
    ...overrides,
  };
}

function byteStream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function cancellableByteStream(value: string) {
  const cancel = vi.fn();
  let sent = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) return;
      sent = true;
      controller.enqueue(new TextEncoder().encode(value));
    },
    cancel,
  });
  return { cancel, stream };
}

function readerStream(value: string) {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const releaseLock = vi.fn();
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      done: false,
      value: new TextEncoder().encode(value),
    })
    .mockResolvedValueOnce({ done: true, value: undefined });
  return {
    cancel,
    releaseLock,
    stream: {
      getReader: () => ({ cancel, read, releaseLock }),
    } as unknown as ReadableStream<Uint8Array>,
  };
}
