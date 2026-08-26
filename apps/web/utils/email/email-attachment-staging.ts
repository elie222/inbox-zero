/* eslint-disable no-process-env */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  BlobNotFoundError,
} from "@vercel/blob";
import {
  EmailSendAttachmentStageStatus,
  EmailSendOperationStatus,
} from "@/generated/prisma/enums";
import type {
  EmailSendAttachmentStage,
  Prisma,
} from "@/generated/prisma/client";
import { env } from "@/env";
import {
  DURABLE_EMAIL_PROCESSING_LEASE_MS,
  executeDurableEmailSend,
} from "@/utils/email/durable-email-send";
import type { EmailProvider } from "@/utils/email/types";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email-cache/policy";
import prisma from "@/utils/prisma";
import { sendEmailBody } from "@/utils/types/mail";
import {
  durableEmailSendBody,
  type DurableStagedEmailSendBody,
} from "./durable-email-send.validation";
import type {
  CompleteEmailAttachmentsBody,
  StageEmailAttachmentsBody,
} from "./email-attachment-staging.validation";

const UPLOAD_URL_LIFETIME_MS = 10 * 60 * 1000;
const STAGE_LIFETIME_MS = MAIL_MUTATION_RETRY_WINDOW_MS;
const TOMBSTONE_LIFETIME_MS = 2 * MAIL_MUTATION_RETRY_WINDOW_MS;
const MAX_LIVE_STAGES_PER_ACCOUNT = 100;
const MAX_LIVE_STAGE_BYTES_PER_ACCOUNT = 100 * 1024 * 1024;
const BLOB_OPERATION_CONCURRENCY = 5;
const REPLAYABLE_STAGE_STATUSES = new Set<EmailSendAttachmentStageStatus>([
  EmailSendAttachmentStageStatus.READY,
  EmailSendAttachmentStageStatus.DELETE_PENDING,
  EmailSendAttachmentStageStatus.DELETED,
]);

type AttachmentMetadata = StageEmailAttachmentsBody["attachments"][number];
type StageRow = EmailSendAttachmentStage;

export class EmailAttachmentStageConflictError extends Error {}
export class EmailAttachmentStageUnavailableError extends Error {}
export class EmailAttachmentStageInvalidError extends Error {}
export class EmailAttachmentStageIncompleteError extends Error {}
export class EmailAttachmentStageConsumedError extends Error {}

export function getEmailAttachmentDeliveryMode(): "direct" | "staged" {
  const hasBlobCredentials = Boolean(
    env.BLOB_READ_WRITE_TOKEN || (env.VERCEL_OIDC_TOKEN && env.BLOB_STORE_ID),
  );
  if (hasBlobCredentials) return "staged";
  if (process.env.VERCEL === "1") {
    throw new EmailAttachmentStageUnavailableError(
      "Private attachment storage is not configured.",
    );
  }
  return "direct";
}

export async function stageEmailAttachments({
  emailAccountId,
  input,
  now = new Date(),
}: {
  emailAccountId: string;
  input: StageEmailAttachmentsBody;
  now?: Date;
}) {
  if (getEmailAttachmentDeliveryMode() === "direct") {
    return { mode: "direct" as const };
  }
  if (input.queuedAt < now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS) {
    throw new EmailAttachmentStageConflictError(
      "This queued email is too old to stage safely.",
    );
  }

  const reservation = await reserveStageRows({ emailAccountId, input, now });
  if (reservation.cleanupRows.length > 0) {
    await mapWithConcurrency(
      reservation.cleanupRows,
      BLOB_OPERATION_CONCURRENCY,
      deleteStageBlob,
    );
    throw new EmailAttachmentStageConflictError(
      "Attachment storage is being refreshed. Try again.",
    );
  }
  const { operationIsTerminal, stagedRows } = reservation;
  const existingPendingIds = new Set(
    reservation.preexistingRows
      .filter((row) => row.status === EmailSendAttachmentStageStatus.PENDING)
      .map(({ id }) => id),
  );

  return {
    mode: "staged" as const,
    attachments: await Promise.all(
      stagedRows.map(async (row) => {
        if (
          row.status === EmailSendAttachmentStageStatus.READY ||
          (operationIsTerminal &&
            (row.status === EmailSendAttachmentStageStatus.DELETE_PENDING ||
              row.status === EmailSendAttachmentStageStatus.DELETED))
        ) {
          return {
            id: row.attachmentId,
            stageId: row.id,
            status: "ready" as const,
          };
        }
        if (existingPendingIds.has(row.id)) {
          const recovered = await recoverCompletedPendingStage(row);
          if (recovered) {
            return {
              id: recovered.attachmentId,
              stageId: recovered.id,
              status: "ready" as const,
            };
          }
        }
        const upload = await createStageUploadUrl(row, now);
        return {
          id: row.attachmentId,
          stageId: row.id,
          status: "upload_required" as const,
          uploadUrl: upload.url,
          uploadExpiresAt: upload.expiresAt,
        };
      }),
    ),
  };
}

async function reserveStageRows({
  emailAccountId,
  input,
  now,
}: {
  emailAccountId: string;
  input: StageEmailAttachmentsBody;
  now: Date;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          let operation = await database.emailSendOperation.findUnique({
            where: {
              emailAccountId_clientMutationId: {
                emailAccountId,
                clientMutationId: input.mutationId,
              },
            },
            select: {
              id: true,
              processingStartedAt: true,
              providerStartedAt: true,
              status: true,
            },
          });
          if (
            operation?.status === EmailSendOperationStatus.PROCESSING &&
            operation.processingStartedAt <=
              new Date(now.getTime() - DURABLE_EMAIL_PROCESSING_LEASE_MS)
          ) {
            if (operation.providerStartedAt === null) {
              const released = await database.emailSendOperation.deleteMany({
                where: {
                  id: operation.id,
                  status: EmailSendOperationStatus.PROCESSING,
                  providerStartedAt: null,
                },
              });
              if (released.count > 0) operation = null;
            } else {
              const uncertain = await database.emailSendOperation.updateMany({
                where: {
                  id: operation.id,
                  status: EmailSendOperationStatus.PROCESSING,
                  providerStartedAt: { not: null },
                },
                data: { status: EmailSendOperationStatus.UNCERTAIN },
              });
              if (uncertain.count > 0) {
                operation = {
                  ...operation,
                  status: EmailSendOperationStatus.UNCERTAIN,
                };
              }
            }
          }
          const operationIsTerminal =
            operation?.status === EmailSendOperationStatus.SENT ||
            operation?.status === EmailSendOperationStatus.UNCERTAIN;
          const rows = await findStageRows(
            database,
            emailAccountId,
            input.mutationId,
          );
          const rowsByAttachmentId = new Map(
            rows.map((row) => [row.attachmentId, row]),
          );
          if (
            rows.length > 0 &&
            (rows.length !== input.attachments.length ||
              input.attachments.some(
                (attachment) => !rowsByAttachmentId.has(attachment.id),
              ))
          ) {
            throw new EmailAttachmentStageConflictError(
              "The attachment set changed for this queued email.",
            );
          }
          for (const attachment of input.attachments) {
            const existing = rowsByAttachmentId.get(attachment.id);
            if (existing && !stageMetadataMatches(existing, attachment)) {
              throw new EmailAttachmentStageConflictError(
                "An attachment ID was reused with different metadata.",
              );
            }
          }
          if (
            operationIsTerminal &&
            input.attachments.some(
              (attachment) => !rowsByAttachmentId.has(attachment.id),
            )
          ) {
            throw new EmailAttachmentStageConflictError(
              "The completed send no longer has attachment replay metadata.",
            );
          }

          const cleanupRows = operationIsTerminal
            ? []
            : rows.filter(
                (row) =>
                  row.status ===
                    EmailSendAttachmentStageStatus.DELETE_PENDING ||
                  (row.status !== EmailSendAttachmentStageStatus.DELETED &&
                    row.expiresAt <= now),
              );
          const additions = input.attachments.filter((attachment) => {
            const existing = rowsByAttachmentId.get(attachment.id);
            return (
              !existing ||
              (!operationIsTerminal &&
                existing.status === EmailSendAttachmentStageStatus.DELETED)
            );
          });
          if (
            operation?.status === EmailSendOperationStatus.PROCESSING &&
            (cleanupRows.length > 0 || additions.length > 0)
          ) {
            throw new EmailAttachmentStageConflictError(
              "This email is already being prepared for sending.",
            );
          }
          if (cleanupRows.length > 0) {
            await database.emailSendAttachmentStage.updateMany({
              where: { id: { in: cleanupRows.map(({ id }) => id) } },
              data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
            });
            return {
              cleanupRows,
              operationIsTerminal,
              preexistingRows: rows,
              stagedRows: [] as StageRow[],
            };
          }

          await assertAccountStageCapacity(
            database,
            emailAccountId,
            additions,
            now,
          );
          const stagedRows: StageRow[] = [];
          for (const attachment of input.attachments) {
            const existing = rowsByAttachmentId.get(attachment.id);
            if (
              existing?.status === EmailSendAttachmentStageStatus.DELETED &&
              !operationIsTerminal
            ) {
              stagedRows.push(
                await database.emailSendAttachmentStage.update({
                  where: { id: existing.id },
                  data: {
                    pathname: createStagePathname(),
                    status: EmailSendAttachmentStageStatus.PENDING,
                    etag: null,
                    deletedAt: null,
                    expiresAt: new Date(now.getTime() + STAGE_LIFETIME_MS),
                  },
                }),
              );
            } else if (existing) {
              stagedRows.push(existing);
            } else {
              stagedRows.push(
                await database.emailSendAttachmentStage.create({
                  data: {
                    emailAccountId,
                    mutationId: input.mutationId,
                    attachmentId: attachment.id,
                    pathname: createStagePathname(),
                    filename: attachment.filename,
                    mimeType: attachment.mimeType,
                    size: attachment.size,
                    disposition: attachment.disposition,
                    contentId: attachment.contentId,
                    expiresAt: new Date(now.getTime() + STAGE_LIFETIME_MS),
                  },
                }),
              );
            }
          }
          return {
            cleanupRows,
            operationIsTerminal,
            preexistingRows: rows,
            stagedRows,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 2 && isRetryableStageReservationError(error)) continue;
      throw error;
    }
  }
  throw new Error("Attachment staging reservation failed.");
}

async function recoverCompletedPendingStage(row: StageRow) {
  let blob: Awaited<ReturnType<typeof head>>;
  try {
    blob = await head(row.pathname, blobCommandOptions());
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    return null;
  }
  if (
    blob.pathname !== row.pathname ||
    blob.size !== row.size ||
    blob.contentType.toLowerCase() !== row.mimeType.toLowerCase()
  ) {
    await invalidateStage(row);
    throw new EmailAttachmentStageConflictError(
      "The existing attachment upload is invalid.",
    );
  }
  return prisma.emailSendAttachmentStage.update({
    where: { id: row.id },
    data: {
      status: EmailSendAttachmentStageStatus.READY,
      etag: blob.etag,
    },
  });
}

export async function completeEmailAttachments({
  emailAccountId,
  input,
  now = new Date(),
}: {
  emailAccountId: string;
  input: CompleteEmailAttachmentsBody;
  now?: Date;
}) {
  const operation = await prisma.emailSendOperation.findUnique({
    where: {
      emailAccountId_clientMutationId: {
        emailAccountId,
        clientMutationId: input.mutationId,
      },
    },
    select: { status: true },
  });
  const operationIsTerminal =
    operation?.status === EmailSendOperationStatus.SENT ||
    operation?.status === EmailSendOperationStatus.UNCERTAIN;
  const rows = await prisma.emailSendAttachmentStage.findMany({
    where: {
      emailAccountId,
      mutationId: input.mutationId,
      id: { in: input.attachments.map(({ stageId }) => stageId) },
    },
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const completed = await mapWithConcurrency(
    input.attachments,
    BLOB_OPERATION_CONCURRENCY,
    async (requested) => {
      const row = rowsById.get(requested.stageId);
      if (!row || row.attachmentId !== requested.id) {
        throw new EmailAttachmentStageInvalidError(
          "The attachment staging reference is invalid.",
        );
      }
      if (
        operationIsTerminal &&
        row.etag &&
        (row.status === EmailSendAttachmentStageStatus.DELETE_PENDING ||
          row.status === EmailSendAttachmentStageStatus.DELETED)
      ) {
        return {
          id: row.attachmentId,
          stageId: row.id,
          status: "ready" as const,
        };
      }
      if (
        row.expiresAt <= now ||
        (row.status !== EmailSendAttachmentStageStatus.PENDING &&
          row.status !== EmailSendAttachmentStageStatus.READY)
      ) {
        if (row.status !== EmailSendAttachmentStageStatus.DELETED) {
          await invalidateStage(row);
        }
        throw new EmailAttachmentStageConsumedError(
          "The attachment staging reference has expired.",
        );
      }
      let blob: Awaited<ReturnType<typeof head>>;
      try {
        blob = await head(row.pathname, blobCommandOptions());
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          if (row.status === EmailSendAttachmentStageStatus.PENDING) {
            throw new EmailAttachmentStageIncompleteError(
              "The attachment upload has not completed.",
            );
          }
          await invalidateStage(row);
          throw new EmailAttachmentStageConsumedError(
            "The verified attachment is no longer available.",
          );
        }
        throw error;
      }
      if (
        blob.pathname !== row.pathname ||
        blob.size !== row.size ||
        blob.contentType.toLowerCase() !== row.mimeType.toLowerCase()
      ) {
        await invalidateStage(row);
        throw new EmailAttachmentStageInvalidError(
          "The uploaded attachment does not match its metadata.",
        );
      }
      await prisma.emailSendAttachmentStage.update({
        where: { id: row.id },
        data: {
          status: EmailSendAttachmentStageStatus.READY,
          etag: blob.etag,
        },
      });
      return {
        id: row.attachmentId,
        stageId: row.id,
        status: "ready" as const,
      };
    },
  );

  return { attachments: completed };
}

export async function executeStagedDurableEmailSend({
  emailAccountId,
  getEmailProvider,
  input,
  provider,
}: {
  emailAccountId: string;
  getEmailProvider: () => Promise<EmailProvider>;
  input: DurableStagedEmailSendBody;
  provider: string;
}) {
  let resolution: Awaited<ReturnType<typeof resolveStagedSend>>;
  try {
    resolution = await resolveStagedSend(emailAccountId, input);
  } catch (error) {
    if (error instanceof EmailAttachmentStageInvalidError) {
      return {
        status: "retry" as const,
        retryReason: "attachment_staging_invalid" as const,
      };
    }
    throw error;
  }

  let stagingInvalid = false;
  const result = await executeDurableEmailSend({
    emailAccountId,
    getEmailProvider,
    input: resolution.input,
    payloadHashInput: resolution.payloadHashInput,
    prepareEmail: async () => {
      try {
        return await materializeStagedEmail(input, resolution.rows);
      } catch (error) {
        if (error instanceof EmailAttachmentStageInvalidError) {
          stagingInvalid = true;
        }
        throw error;
      }
    },
    provider,
  });
  if (result.status === "retry" && stagingInvalid) {
    return { ...result, retryReason: "attachment_staging_invalid" as const };
  }
  if (
    result.status === "applied" ||
    result.status === "already_applied" ||
    result.status === "uncertain"
  ) {
    await cleanupAppliedStages(resolution.rows);
  }
  return result;
}

export async function cleanupEmailAttachmentStages(now = new Date()) {
  const live = await prisma.emailSendAttachmentStage.findMany({
    where: {
      status: {
        in: [
          EmailSendAttachmentStageStatus.PENDING,
          EmailSendAttachmentStageStatus.READY,
        ],
      },
    },
    orderBy: { expiresAt: "asc" },
    take: 100,
  });
  const operations =
    live.length === 0
      ? []
      : await prisma.emailSendOperation.findMany({
          where: {
            OR: live.map((row) => ({
              emailAccountId: row.emailAccountId,
              clientMutationId: row.mutationId,
            })),
          },
          select: {
            emailAccountId: true,
            clientMutationId: true,
            id: true,
            processingStartedAt: true,
            providerStartedAt: true,
            status: true,
          },
        });
  const operationByMutation = new Map<string, EmailSendOperationStatus>();
  const staleBefore = new Date(
    now.getTime() - DURABLE_EMAIL_PROCESSING_LEASE_MS,
  );
  for (const operation of operations) {
    let status = operation.status;
    if (
      status === EmailSendOperationStatus.PROCESSING &&
      operation.processingStartedAt <= staleBefore
    ) {
      if (operation.providerStartedAt === null) {
        const released = await prisma.emailSendOperation.deleteMany({
          where: {
            id: operation.id,
            status: EmailSendOperationStatus.PROCESSING,
            providerStartedAt: null,
            processingStartedAt: { lte: staleBefore },
          },
        });
        if (released.count > 0) continue;
      } else {
        const uncertain = await prisma.emailSendOperation.updateMany({
          where: {
            id: operation.id,
            status: EmailSendOperationStatus.PROCESSING,
            providerStartedAt: { not: null },
            processingStartedAt: { lte: staleBefore },
          },
          data: { status: EmailSendOperationStatus.UNCERTAIN },
        });
        if (uncertain.count > 0) status = EmailSendOperationStatus.UNCERTAIN;
      }
    }
    operationByMutation.set(
      `${operation.emailAccountId}:${operation.clientMutationId}`,
      status,
    );
  }
  const abandonedOrTerminal = live.filter((row) => {
    const operationStatus = operationByMutation.get(
      `${row.emailAccountId}:${row.mutationId}`,
    );
    return (
      operationStatus === EmailSendOperationStatus.SENT ||
      operationStatus === EmailSendOperationStatus.UNCERTAIN ||
      (row.expiresAt < now &&
        operationStatus !== EmailSendOperationStatus.PROCESSING)
    );
  });
  if (abandonedOrTerminal.length > 0) {
    await prisma.emailSendAttachmentStage.updateMany({
      where: { id: { in: abandonedOrTerminal.map(({ id }) => id) } },
      data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
    });
  }

  const pending = await prisma.emailSendAttachmentStage.findMany({
    where: {
      status: EmailSendAttachmentStageStatus.DELETE_PENDING,
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  const deletionCandidates = new Map(
    [...abandonedOrTerminal, ...pending].map((row) => [row.id, row]),
  );
  const deletionResults = await mapWithConcurrency(
    [...deletionCandidates.values()],
    BLOB_OPERATION_CONCURRENCY,
    deleteStageBlob,
  );
  const deletedBlobs = deletionResults.filter(Boolean).length;

  const tombstones = await prisma.emailSendAttachmentStage.findMany({
    where: {
      status: EmailSendAttachmentStageStatus.DELETED,
      updatedAt: {
        lt: new Date(now.getTime() - TOMBSTONE_LIFETIME_MS),
      },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  const deletedTombstones =
    tombstones.length === 0
      ? 0
      : (
          await prisma.emailSendAttachmentStage.deleteMany({
            where: { id: { in: tombstones.map(({ id }) => id) } },
          })
        ).count;
  return {
    deletedBlobs,
    deletedTombstones,
  };
}

async function resolveStagedSend(
  emailAccountId: string,
  input: DurableStagedEmailSendBody,
) {
  const attachments = input.email.attachments ?? [];
  const rows = await prisma.emailSendAttachmentStage.findMany({
    where: {
      emailAccountId,
      mutationId: input.mutationId,
      id: {
        in: attachments.map(({ stagedAttachmentId }) => stagedAttachmentId),
      },
    },
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = attachments.map((attachment) => {
    const row = rowsById.get(attachment.stagedAttachmentId);
    if (
      !row?.etag ||
      row.attachmentId !== attachment.id ||
      !stageMetadataMatches(row, attachment) ||
      !REPLAYABLE_STAGE_STATUSES.has(row.status)
    ) {
      throw new EmailAttachmentStageInvalidError(
        "The staged attachments are no longer valid.",
      );
    }
    return row;
  });
  if (new Set(orderedRows.map(({ id }) => id)).size !== orderedRows.length) {
    throw new EmailAttachmentStageInvalidError(
      "Staged attachment IDs must be unique.",
    );
  }
  const inputWithoutAttachments = durableEmailSendBody.parse({
    ...input,
    email: { ...input.email, attachments: undefined },
  });
  const payloadHashInput = JSON.stringify({
    threadId: input.threadId,
    messageIds: input.messageIds,
    queuedAt: input.queuedAt,
    email: {
      ...input.email,
      attachments: attachments.map((attachment, index) => ({
        ...attachment,
        authoritativeEtag: orderedRows[index].etag,
      })),
    },
  });
  return {
    input: inputWithoutAttachments,
    payloadHashInput,
    rows: orderedRows,
  };
}

async function materializeStagedEmail(
  input: DurableStagedEmailSendBody,
  rows: StageRow[],
) {
  const attachments = input.email.attachments ?? [];
  const materialized = [];
  for (const [index, row] of rows.entries()) {
    if (row.status !== EmailSendAttachmentStageStatus.READY) {
      throw new EmailAttachmentStageInvalidError(
        "The staged attachment has already been removed.",
      );
    }
    let result: Awaited<ReturnType<typeof get>>;
    try {
      result = await get(row.pathname, {
        access: "private",
        useCache: false,
        ...blobCommandOptions(),
      });
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        await invalidateStage(row);
        throw new EmailAttachmentStageInvalidError(
          "The staged attachment could not be found.",
        );
      }
      throw error;
    }
    if (
      result?.statusCode !== 200 ||
      result.blob.pathname !== row.pathname ||
      result.blob.etag !== row.etag ||
      result.blob.size !== row.size ||
      result.blob.contentType.toLowerCase() !== row.mimeType.toLowerCase()
    ) {
      await invalidateStage(row);
      throw new EmailAttachmentStageInvalidError(
        "The staged attachment changed after verification.",
      );
    }
    let bytes: Buffer;
    try {
      bytes = await readExactBlobBytes(result.stream, row.size);
    } catch (error) {
      if (error instanceof EmailAttachmentStageInvalidError) {
        await invalidateStage(row);
      }
      throw error;
    }
    const metadata = attachments[index];
    materialized.push({
      id: metadata.id,
      filename: metadata.filename,
      contentType: metadata.mimeType,
      size: metadata.size,
      disposition: metadata.disposition,
      contentId: metadata.contentId,
      content: bytes.toString("base64"),
    });
  }
  try {
    return sendEmailBody.parse({
      ...input.email,
      attachments: materialized,
    });
  } catch {
    for (const row of rows) await invalidateStage(row);
    throw new EmailAttachmentStageInvalidError(
      "The staged attachment content is invalid.",
    );
  }
}

async function readExactBlobBytes(
  stream: ReadableStream<Uint8Array>,
  expectedSize: number,
) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedSize) {
        throw new EmailAttachmentStageInvalidError(
          "The staged attachment is larger than expected.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (received !== expectedSize) {
    throw new EmailAttachmentStageInvalidError(
      "The staged attachment size changed.",
    );
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    received,
  );
}

async function cleanupAppliedStages(rows: StageRow[]) {
  await prisma.emailSendAttachmentStage.updateMany({
    where: {
      id: { in: rows.map(({ id }) => id) },
      status: EmailSendAttachmentStageStatus.READY,
    },
    data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
  });
}

async function deleteStageBlob(row: StageRow) {
  try {
    await del(row.pathname, {
      ...blobCommandOptions(),
      ...(row.etag ? { ifMatch: row.etag } : {}),
    });
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) return false;
  }
  await prisma.emailSendAttachmentStage.update({
    where: { id: row.id },
    data: {
      status: EmailSendAttachmentStageStatus.DELETED,
      deletedAt: new Date(),
    },
  });
  return true;
}

async function invalidateStage(row: StageRow) {
  await prisma.emailSendAttachmentStage.updateMany({
    where: { id: row.id },
    data: { status: EmailSendAttachmentStageStatus.DELETE_PENDING },
  });
  await deleteStageBlob(row);
}

async function createStageUploadUrl(row: StageRow, now: Date) {
  const expiresAt = now.getTime() + UPLOAD_URL_LIFETIME_MS;
  const signedToken = await issueSignedToken({
    pathname: row.pathname,
    operations: ["put"],
    validUntil: expiresAt,
    allowedContentTypes: [row.mimeType],
    maximumSizeInBytes: row.size,
    ...blobCommandOptions(),
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: "private",
    operation: "put",
    pathname: row.pathname,
    validUntil: expiresAt,
    allowedContentTypes: [row.mimeType],
    maximumSizeInBytes: row.size,
    allowOverwrite: false,
    addRandomSuffix: false,
  });
  return { url: presignedUrl, expiresAt };
}

async function assertAccountStageCapacity(
  database: Prisma.TransactionClient,
  emailAccountId: string,
  additions: AttachmentMetadata[],
  now: Date,
) {
  if (additions.length === 0) return;
  const live = await database.emailSendAttachmentStage.aggregate({
    where: {
      emailAccountId,
      status: {
        in: [
          EmailSendAttachmentStageStatus.PENDING,
          EmailSendAttachmentStageStatus.READY,
        ],
      },
      expiresAt: { gt: now },
    },
    _count: { _all: true },
    _sum: { size: true },
  });
  const addedBytes = additions.reduce((total, item) => total + item.size, 0);
  if (
    live._count._all + additions.length > MAX_LIVE_STAGES_PER_ACCOUNT ||
    (live._sum.size ?? 0) + addedBytes > MAX_LIVE_STAGE_BYTES_PER_ACCOUNT
  ) {
    throw new EmailAttachmentStageConflictError(
      "Too many attachments are waiting to send.",
    );
  }
}

function stageMetadataMatches(row: StageRow, metadata: AttachmentMetadata) {
  return (
    row.attachmentId === metadata.id &&
    row.filename === metadata.filename &&
    row.mimeType.toLowerCase() === metadata.mimeType.toLowerCase() &&
    row.size === metadata.size &&
    row.disposition === metadata.disposition &&
    (row.contentId ?? undefined) === metadata.contentId
  );
}

function findStageRows(
  database: Prisma.TransactionClient,
  emailAccountId: string,
  mutationId: string,
) {
  return database.emailSendAttachmentStage.findMany({
    where: { emailAccountId, mutationId },
    orderBy: { createdAt: "asc" },
  });
}

function createStagePathname() {
  return `mail-attachments/${randomUUID().replaceAll("-", "")}`;
}

function isRetryableStageReservationError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return error.code === "P2002" || error.code === "P2034";
}

function blobCommandOptions() {
  return {
    token: env.BLOB_READ_WRITE_TOKEN,
    oidcToken: env.VERCEL_OIDC_TOKEN,
    storeId: env.BLOB_STORE_ID,
  };
}

async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  concurrency: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
