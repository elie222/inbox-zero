import { createHash } from "node:crypto";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import type { EmailProvider } from "@/utils/email/types";
import { parsedMessagePatch } from "@/utils/mail-api/observations";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { createScopedLogger } from "@/utils/logger";
import {
  activatePreparedSnoozedThread,
  cancelSnoozedThreadByClientMutationId,
  prepareSnoozedThread,
} from "@/utils/snooze/scheduler";
import prisma from "@/utils/prisma";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import {
  createFileBlobStore,
  readBlobMetadata,
} from "@inboxzero/mail-sqlite/blob-store";
import {
  accountMailUploadDirectory,
  holdAccountUploads,
  releaseAccountUploadHolds,
} from "@/utils/mail-api/upload-blobs";

const logger = createScopedLogger("mail-api/operations");

export function createEmailProviderOperationExecutor(input: {
  provider: EmailProvider;
  accountId: string;
}): OperationExecutor {
  const { provider, accountId } = input;
  const providerName = provider.name === "microsoft" ? "microsoft" : "google";
  return {
    async execute({ operation }) {
      if (operation.intent.kind === "send") {
        return executeSend(provider, accountId, operation);
      }
      if (operation.intent.kind !== "metadata") {
        return { status: "rejected", code: "unsupported", targets: [] };
      }
      if (operation.intent.change.kind === "snooze") {
        return executeSnooze(provider, accountId, {
          key: operation.key,
          intent: {
            kind: "metadata",
            targets: operation.intent.targets,
            change: operation.intent.change,
          },
        });
      }
      const targets = [];
      const observations = [];
      for (const target of operation.intent.targets) {
        try {
          await applyChange(provider, operation.intent.change, [
            target.messageId,
          ]);
          try {
            const message = await provider.getMessage(target.messageId);
            observations.push(
              parsedMessagePatch(accountId, providerName, message),
            );
          } catch {
            // Mutation applied; catch-up can fill the observation.
          }
          targets.push({
            key: target,
            outcome: "applied" as const,
            code: null,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "provider_error";
          if (/auth|unauthorized|401/i.test(message) && targets.length === 0) {
            return {
              status: "not_dispatched",
              reason: "blocked_auth",
              retryAfterMs: null,
            };
          }
          targets.push({
            key: target,
            outcome: /not.?found|404/i.test(message)
              ? ("rejected" as const)
              : ("uncertain" as const),
            code: /not.?found|404/i.test(message)
              ? "not_found"
              : "provider_error",
          });
        }
      }
      const applied = targets.some((target) => target.outcome === "applied");
      const rejected = targets.every((target) => target.outcome === "rejected");
      if (rejected && !applied) {
        return {
          status: "rejected",
          code: targets[0]?.code ?? "provider_error",
          targets,
        };
      }
      if (!applied) {
        return {
          status: "uncertain",
          receiptId: operation.key.operationId,
        };
      }
      return {
        status: "confirmed",
        receiptId: operation.key.operationId,
        observations,
        targets,
      };
    },
    async inspect({ operation }) {
      if (operation.intent.kind === "send") {
        return inspectSend(provider, accountId, operation);
      }
      if (operation.intent.kind !== "metadata") {
        return { status: "uncertain", receiptId: operation.key.operationId };
      }
      try {
        const observations = [];
        for (const target of operation.intent.targets) {
          const message = await provider.getMessage(target.messageId);
          observations.push(
            parsedMessagePatch(accountId, providerName, message),
          );
        }
        return {
          status: "confirmed",
          receiptId: operation.key.operationId,
          observations,
          targets: operation.intent.targets.map((key) => ({
            key,
            outcome: "applied" as const,
            code: null,
          })),
        };
      } catch {
        return { status: "uncertain", receiptId: operation.key.operationId };
      }
    },
  };
}

async function applyChange(
  provider: EmailProvider,
  change: {
    kind: string;
    read?: boolean;
    starred?: boolean;
    spam?: boolean;
    folderId?: string;
    membership?: "label" | "category";
    id?: string;
    present?: boolean;
  },
  messageIds: string[],
) {
  switch (change.kind) {
    case "archive":
      await provider.archiveMessages(messageIds);
      return;
    case "unarchive":
      await provider.unarchiveMessages(messageIds);
      return;
    case "set_read":
      await provider.markMessagesReadState(messageIds, Boolean(change.read));
      return;
    case "set_starred":
      await provider.markMessagesStarredState(
        messageIds,
        Boolean(change.starred),
      );
      return;
    case "trash":
      await provider.trashMessages(messageIds);
      return;
    case "restore_from_trash":
      await provider.untrashMessages(messageIds);
      return;
    case "set_spam": {
      for (const messageId of messageIds) {
        const message = await provider.getMessage(messageId);
        if (change.spam) {
          await provider.markSpam(message.threadId);
        } else {
          await provider.unarchiveThread(message.threadId);
        }
      }
      return;
    }
    case "move": {
      if (!change.folderId) return;
      for (const messageId of messageIds) {
        const message = await provider.getMessage(messageId);
        await provider.moveThreadToFolder(
          message.threadId,
          message.headers.to || "",
          change.folderId,
        );
      }
      return;
    }
    case "set_membership": {
      if (!change.id) return;
      for (const messageId of messageIds) {
        const message = await provider.getMessage(messageId);
        if (change.present) {
          await provider.labelMessage({
            messageId,
            labelId: change.id,
            labelName: null,
          });
        } else {
          await provider.removeThreadLabel(message.threadId, change.id);
        }
      }
      return;
    }
    case "snooze": {
      await provider.archiveMessages(messageIds);
      return;
    }
    default:
      throw new Error(`unsupported:${change.kind}`);
  }
}

async function executeSnooze(
  provider: EmailProvider,
  accountId: string,
  operation: {
    key: { operationId: string };
    intent: {
      kind: "metadata";
      targets: Array<{ accountId: string; messageId: string }>;
      change: { kind: "snooze"; untilMs: number };
    };
  },
) {
  const scheduledFor = new Date(operation.intent.change.untilMs);
  const threadId = await threadIdForSnooze(provider, operation.intent.targets);
  if (!threadId) {
    return {
      status: "rejected" as const,
      code: "snooze_failed",
      targets: [],
    };
  }
  const prepared = await prepareSnoozedThread({
    clientMutationId: operation.key.operationId,
    emailAccountId: accountId,
    scheduledFor,
    threadId,
  });
  if (prepared.created && scheduledFor.getTime() <= Date.now()) {
    await cancelPreparedSnooze(accountId, operation.key.operationId);
    return {
      status: "rejected" as const,
      code: "snooze_expired",
      targets: [],
    };
  }
  if (prepared.snoozedThread.status === "CANCELLED") {
    const restored = await restoreSnoozeTargets(
      provider,
      operation.intent.targets,
    );
    if (!restored) return restoreFailed();
    return {
      status: "rejected" as const,
      code: "snooze_cancelled",
      targets: [],
    };
  }
  if (prepared.snoozedThread.status !== "PREPARING") {
    return {
      status: "confirmed" as const,
      receiptId: operation.key.operationId,
      observations: [],
      targets: appliedSnoozeTargets(operation.intent.targets),
    };
  }
  if (scheduledFor.getTime() <= Date.now()) {
    const restored = await restoreSnoozeTargets(
      provider,
      operation.intent.targets,
    );
    if (!restored) return restoreFailed();
    await cancelPreparedSnooze(accountId, operation.key.operationId);
    return {
      status: "confirmed" as const,
      receiptId: operation.key.operationId,
      observations: [],
      targets: appliedSnoozeTargets(operation.intent.targets),
    };
  }

  const targets = [];
  const observations = [];
  const providerName = provider.name === "microsoft" ? "microsoft" : "google";
  for (const target of operation.intent.targets) {
    try {
      const message = await provider.getMessage(target.messageId);
      await provider.archiveThreadWithLabel(message.threadId, "");
      observations.push(parsedMessagePatch(accountId, providerName, message));
      targets.push({
        key: target,
        outcome: "applied" as const,
        code: null,
      });
    } catch {
      try {
        await provider.archiveMessages([target.messageId]);
        targets.push({
          key: target,
          outcome: "applied" as const,
          code: null,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "provider_error";
        targets.push({
          key: target,
          outcome: "rejected" as const,
          code: message,
        });
      }
    }
  }
  const applied = targets.filter((target) => target.outcome === "applied");
  if (applied.length === 0) {
    await cancelPreparedSnooze(accountId, operation.key.operationId);
    return {
      status: "rejected" as const,
      code: "snooze_failed",
      targets,
    };
  }
  const activated = await activatePreparedSnoozedThread({
    clientMutationId: operation.key.operationId,
    emailAccountId: accountId,
    scheduledFor,
    threadId,
  });
  if (activated.status === "CANCELLED") {
    const restored = await restoreSnoozeTargets(
      provider,
      applied.map((target) => target.key),
    );
    if (!restored) return restoreFailed();
  }
  return {
    status: "confirmed" as const,
    receiptId: operation.key.operationId,
    observations,
    targets,
  };
}

async function executeSend(
  provider: EmailProvider,
  accountId: string,
  operation: PreparedOperation,
) {
  if (operation.intent.kind !== "send") {
    return { status: "rejected" as const, code: "unsupported", targets: [] };
  }
  try {
    await holdAccountUploads(accountId, operation.intent.attachmentIds);
    const attachments = await loadSendAttachments(
      accountId,
      operation.intent.attachmentIds,
    );
    const outcome = await executeDurableEmailSend({
      logger,
      emailAccountId: accountId,
      getEmailProvider: async () => provider,
      provider: provider.name === "microsoft" ? "microsoft" : "google",
      input: {
        mutationId: sendMutationId(operation.key.operationId),
        queuedAt: operation.intent.queuedAtMs,
        threadId: operation.intent.replyToMessageId
          ? operation.intent.replyToConversationId
          : null,
        messageIds: operation.intent.replyToMessageId
          ? [operation.intent.replyToMessageId]
          : [operation.intent.frozenDraftId],
        email: {
          to: operation.intent.to.join(", "),
          cc: operation.intent.cc.join(", ") || undefined,
          bcc: operation.intent.bcc.join(", ") || undefined,
          subject: operation.intent.subject,
          messageHtml: `${operation.intent.html}${operation.intent.quotedHtml}`,
          replyToEmail:
            operation.intent.replyToMessageId &&
            operation.intent.replyToConversationId
              ? {
                  threadId: operation.intent.replyToConversationId,
                  messageId: operation.intent.replyToMessageId,
                }
              : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          ...(operation.intent.providerDraftId
            ? { providerDraftId: operation.intent.providerDraftId }
            : {}),
        },
      },
    });
    const result = mapSendOutcome(
      operation.key.operationId,
      outcome,
      await observeSentMessage(provider, accountId, sentMessageIdFrom(outcome)),
    );
    if (result.status === "confirmed") {
      await releaseSendAttachments(accountId, operation.intent.attachmentIds);
    }
    return result;
  } finally {
    await releaseAccountUploadHolds(accountId, operation.intent.attachmentIds);
  }
}

async function inspectSend(
  provider: EmailProvider,
  accountId: string,
  operation: PreparedOperation,
) {
  const mutationId = sendMutationId(operation.key.operationId);
  const found = await prisma.emailSendOperation.findUnique({
    where: {
      emailAccountId_clientMutationId: {
        emailAccountId: accountId,
        clientMutationId: mutationId,
      },
    },
  });
  if (!found) {
    return { status: "uncertain" as const, receiptId: mutationId };
  }
  if (found.status === EmailSendOperationStatus.SENT) {
    if (operation.intent.kind === "send") {
      await releaseSendAttachments(accountId, operation.intent.attachmentIds);
    }
    return {
      status: "confirmed" as const,
      receiptId: mutationId,
      observations: await observeSentMessage(
        provider,
        accountId,
        sentMessageIdFromResult(found.result),
      ),
      targets: [],
    };
  }
  if (found.status === EmailSendOperationStatus.UNCERTAIN) {
    return { status: "uncertain" as const, receiptId: mutationId };
  }
  return { status: "uncertain" as const, receiptId: mutationId };
}

function mapSendOutcome(
  operationId: string,
  outcome: Awaited<ReturnType<typeof executeDurableEmailSend>>,
  observations: ReturnType<typeof parsedMessagePatch>[] = [],
) {
  const receiptId = sendMutationId(operationId);
  if (outcome.status === "applied" || outcome.status === "already_applied") {
    return {
      status: "confirmed" as const,
      receiptId,
      observations,
      targets: [],
    };
  }
  if (outcome.status === "rejected") {
    return {
      status: "rejected" as const,
      code: outcome.error,
      targets: [],
    };
  }
  if (outcome.status === "blocked_auth") {
    return {
      status: "not_dispatched" as const,
      reason: "blocked_auth" as const,
      retryAfterMs: null,
    };
  }
  if (outcome.status === "retry") {
    return {
      status: "not_dispatched" as const,
      reason: "unavailable" as const,
      retryAfterMs: 1000,
    };
  }
  return { status: "uncertain" as const, receiptId };
}

function sendMutationId(operationId: string) {
  const compact = operationId.toLowerCase().replace(/-/g, "");
  if (compact.length === 32 && [...compact].every(isHexChar)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
  }
  const hex = createHash("sha1")
    .update(`mail-engine-send:${operationId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isHexChar(value: string) {
  return (value >= "0" && value <= "9") || (value >= "a" && value <= "f");
}

async function releaseSendAttachments(
  accountId: string,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) return;
  const directory = accountMailUploadDirectory(accountId);
  const store = createFileBlobStore(directory);
  for (const blobId of attachmentIds) {
    await store.delete(blobId).catch(() => undefined);
  }
}

async function loadSendAttachments(accountId: string, attachmentIds: string[]) {
  if (attachmentIds.length === 0) return [];
  const directory = accountMailUploadDirectory(accountId);
  const store = createFileBlobStore(directory);
  const attachments = [];
  for (const blobId of attachmentIds) {
    const stream = await store.read(blobId);
    if (!stream) continue;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const metadata = await readBlobMetadata(directory, blobId);
    attachments.push({
      filename: metadata?.filename ?? blobId,
      content: bytes.toString("base64"),
      contentType: metadata?.contentType ?? "application/octet-stream",
      size: bytes.byteLength,
    });
  }
  return attachments;
}

function appliedSnoozeTargets(
  targets: Array<{ accountId: string; messageId: string }>,
) {
  return targets.map((target) => ({
    key: target,
    outcome: "applied" as const,
    code: null,
  }));
}

async function restoreSnoozeTargets(
  provider: EmailProvider,
  targets: Array<{ messageId: string }>,
) {
  const messageIds = targets.map((target) => target.messageId);
  if (messageIds.length === 0) return true;
  try {
    await provider.unarchiveMessages(messageIds);
    return true;
  } catch {
    return false;
  }
}

function restoreFailed() {
  return {
    status: "not_dispatched" as const,
    reason: "unavailable" as const,
    retryAfterMs: 1000,
  };
}

async function cancelPreparedSnooze(accountId: string, operationId: string) {
  try {
    await cancelSnoozedThreadByClientMutationId({
      clientMutationId: operationId,
      emailAccountId: accountId,
    });
  } catch {
    // The prepare row is optional once we are already rejecting.
  }
}

async function threadIdForSnooze(
  provider: EmailProvider,
  targets: Array<{ messageId: string }>,
) {
  const first = targets[0];
  if (!first) return null;
  try {
    const message = await provider.getMessage(first.messageId);
    return message.threadId;
  } catch {
    return first.messageId;
  }
}

async function observeSentMessage(
  provider: EmailProvider,
  accountId: string,
  messageId: string | null,
) {
  if (!messageId) return [];
  try {
    const message = await provider.getMessage(messageId);
    return [
      parsedMessagePatch(
        accountId,
        provider.name === "microsoft" ? "microsoft" : "google",
        message,
      ),
    ];
  } catch {
    return [];
  }
}

function sentMessageIdFrom(
  outcome: Awaited<ReturnType<typeof executeDurableEmailSend>>,
) {
  if (outcome.status !== "applied" && outcome.status !== "already_applied") {
    return null;
  }
  return sentMessageIdFromResult(
    "result" in outcome ? outcome.result : undefined,
  );
}

function sentMessageIdFromResult(result: unknown) {
  if (!result || typeof result !== "object" || !("messageId" in result)) {
    return null;
  }
  return typeof result.messageId === "string" ? result.messageId : null;
}
