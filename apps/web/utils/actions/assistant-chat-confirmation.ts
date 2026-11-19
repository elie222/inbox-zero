import "server-only";

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import { forwardMessage } from "@/utils/email/forward-message";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";
import { convertNewlinesToBr, escapeHtml, truncate } from "@/utils/string";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  ASSISTANT_CONFIRMATION_PROCESSING_LEASE_MS,
  type AssistantEmailConfirmationResult,
  type AssistantPendingEmailActionType,
  type AssistantPendingEmailToolOutput,
  pendingBulkInboxActionToolOutputSchema,
  pendingCreateRuleToolOutputSchema,
  pendingForwardEmailToolOutputSchema,
  pendingReplyEmailToolOutputSchema,
  pendingSaveMemoryToolOutputSchema,
  pendingSendEmailToolOutputSchema,
  pendingTrashThreadsToolOutputSchema,
  type PendingForwardEmailToolOutput,
  type PendingReplyEmailToolOutput,
  type PendingSendEmailToolOutput,
} from "./assistant-chat.validation";
import {
  buildCreateRuleSchemaFromChatToolInput,
  type ChatCreateRuleToolInvocation,
} from "@/utils/ai/assistant/tools/rules/shared";
import { createRule } from "@/utils/rule/rule";
import { enqueueBulkInboxActionChunk } from "@/utils/bulk-inbox-action/enqueue";
import {
  deleteChatDrafts,
  trashChatThreads,
} from "@/utils/ai/assistant/chat-inbox-tools";
import { addChatActionTotals } from "@/utils/ai/assistant/chat-action-totals";
import { notifyMailboxChanged } from "@/utils/mailbox-push";

const CONFIRMATION_IN_PROGRESS_ERROR =
  "Email action confirmation already in progress";
const BULK_INBOX_ACTION_CONFIRMATION_IN_PROGRESS_ERROR =
  "Bulk action confirmation already in progress";
const TRASH_THREADS_CONFIRMATION_IN_PROGRESS_ERROR =
  "Trash confirmation already in progress";
const SAVE_MEMORY_CONFIRMATION_IN_PROGRESS_ERROR =
  "Memory save confirmation already in progress";
const CONFIRMATION_PERSIST_MAX_ATTEMPTS = 3;
const PENDING_ACTION_PERSIST_WAIT_MS = 2000;
const PENDING_ACTION_POLL_INTERVAL_MS = 250;
const SENT_MESSAGE_RESOLVE_MAX_ATTEMPTS = 5;
const SENT_MESSAGE_RESOLVE_RETRY_MS = 500;
const SENT_MESSAGE_RESOLVE_LOOKBACK_MS = 60 * 1000;
const SENT_MESSAGE_LINK_TIMEOUT_MS = 5000;

const ASSISTANT_EMAIL_ACTION_METADATA: Record<
  AssistantPendingEmailActionType,
  {
    toolType: string;
    errorMessage: string;
    schema: z.ZodType<AssistantPendingEmailToolOutput>;
  }
> = {
  send_email: {
    toolType: "tool-sendEmail",
    errorMessage: "Failed to send email",
    schema: pendingSendEmailToolOutputSchema,
  },
  reply_email: {
    toolType: "tool-replyEmail",
    errorMessage: "Failed to send reply",
    schema: pendingReplyEmailToolOutputSchema,
  },
  forward_email: {
    toolType: "tool-forwardEmail",
    errorMessage: "Failed to forward email",
    schema: pendingForwardEmailToolOutputSchema,
  },
};

export async function confirmAssistantEmailActionForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  actionType,
  contentOverride,
  waitForPersistence,
  persistenceWaitMs,
  emailAccountId,
  provider,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  contentOverride?: string;
  waitForPersistence?: boolean;
  persistenceWaitMs?: number;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const { toolType, schema } = ASSISTANT_EMAIL_ACTION_METADATA[actionType];
  const findPart = (parts: unknown) =>
    findPendingToolPart({ parts, toolCallId, toolType, schema });

  const reservation = await reservePendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId, actionType }),
    findPart,
    getConfirmed: getConfirmationResult,
    validateLookup: (lookup) => {
      if (lookup.output.emailAccountId !== emailAccountId) {
        throw new SafeError(
          "The sending mailbox for this draft could not be verified. Prepare the draft again in the account you want to send from.",
        );
      }
    },
    logPrefix: "Assistant email confirmation",
    waitForPersistence,
    persistenceWaitMs,
    inProgressError: CONFIRMATION_IN_PROGRESS_ERROR,
    notFoundError: "Pending assistant action not found",
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      actionType,
      confirmationResult: reservation.value,
    };
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  let confirmationResult: AssistantEmailConfirmationResult;
  try {
    confirmationResult = await executeAssistantEmailAction({
      output: reservation.lookup.output,
      emailProvider,
      emailAccountId,
      contentOverride,
    });
  } catch (error) {
    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      processingAt: reservation.processingAt,
      emailAccountId,
      findPart,
    }).catch((processingError) => {
      logger.error("Failed to clear processing state for email action", {
        error: processingError,
        actionType,
      });
    });

    logger.error("Failed to confirm assistant email action", {
      error,
      actionType,
    });
    throw new SafeError(getAssistantEmailActionErrorMessage(actionType, error));
  }

  if (provider === "microsoft" && confirmationResult.messageId) {
    let linkTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // This optional lookup must not hold up persistence past the processing lease.
      const sentMessage = await Promise.race([
        emailProvider.getMessage(confirmationResult.messageId),
        new Promise<never>((_, reject) => {
          linkTimeout = setTimeout(
            () => reject(new Error("Timed out resolving sent email link")),
            SENT_MESSAGE_LINK_TIMEOUT_MS,
          );
        }),
      ]);
      confirmationResult.externalUrl = sentMessage.externalUrl;
    } catch (error) {
      logger.warn("Failed to resolve sent email link", { error });
    } finally {
      clearTimeout(linkTimeout);
    }
  }

  try {
    await persistConfirmedAssistantPart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      logger: logger.with({
        chatMessageId: reservation.chatMessageId,
        toolCallId,
        actionType,
      }),
      findPart,
      isConfirmed: (lookup) => !!getConfirmationResult(lookup),
      buildParts: ({ parts, partIndex }) =>
        updateAssistantPartOutput({
          parts,
          partIndex,
          outputPatch: {
            success: true,
            confirmationState: "confirmed",
            confirmationResult,
          },
          pendingActionPatch: contentOverride
            ? getPendingActionContentPatch(actionType, contentOverride)
            : undefined,
        }),
    });
  } catch (error) {
    logger.error("Failed to persist confirmed assistant email action", {
      error,
      actionType,
    });
    throw new SafeError(
      "Email was sent but confirmation state could not be saved. Please refresh and try again.",
    );
  }

  return {
    success: true,
    confirmationState: "confirmed" as const,
    actionType,
    confirmationResult,
  };
}

export async function confirmAssistantCreateRuleForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  waitForPersistence,
  emailAccountId,
  provider,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  waitForPersistence?: boolean;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const findPart = (parts: unknown) =>
    findPendingToolPart({
      parts,
      toolCallId,
      toolType: "tool-createRule",
      schema: pendingCreateRuleToolOutputSchema,
    });

  const reservation = await reservePendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId }),
    findPart,
    getConfirmed: (lookup) =>
      lookup.output.confirmationState === "confirmed" && lookup.output.ruleId
        ? lookup.output.ruleId
        : null,
    logPrefix: "Assistant create rule confirmation",
    waitForPersistence,
    inProgressError: CONFIRMATION_IN_PROGRESS_ERROR,
    notFoundError: "Pending rule creation not found",
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      ruleId: reservation.value,
    };
  }

  const { output, toolInput } = reservation.lookup;
  if (!isRecord(toolInput)) {
    throw new SafeError("Invalid create-rule tool input");
  }

  const persistConfirmedRule = async (ruleId: string) => {
    const confirmationResult = {
      ruleId,
      confirmedAt: new Date().toISOString(),
    };
    try {
      await persistConfirmedAssistantPart({
        chatMessageId: reservation.chatMessageId,
        emailAccountId,
        logger: logger.with({
          chatMessageId: reservation.chatMessageId,
          toolCallId,
          ruleId,
        }),
        findPart,
        isConfirmed: (lookup) =>
          lookup.output.confirmationState === "confirmed" &&
          lookup.output.ruleId === ruleId,
        buildParts: ({ parts, partIndex }) =>
          updateAssistantPartOutput({
            parts,
            partIndex,
            outputPatch: {
              success: true,
              actionType: "create_rule",
              requiresConfirmation: true,
              confirmationState: "confirmed",
              riskMessages: output.riskMessages,
              ruleId,
              confirmationResult,
            },
          }),
      });
    } catch (persistError) {
      logger.error("Failed to persist confirmed assistant create rule", {
        error: persistError,
        ruleId,
      });
      throw new SafeError(
        "Rule was created but confirmation state could not be saved. Please refresh and try again.",
      );
    }

    return {
      success: true,
      confirmationState: "confirmed" as const,
      ruleId,
      confirmationResult,
    };
  };

  let rule: Awaited<ReturnType<typeof createRule>>;
  try {
    rule = await createRule({
      result: buildCreateRuleSchemaFromChatToolInput(
        toolInput as ChatCreateRuleToolInvocation,
        provider,
      ),
      emailAccountId,
      provider,
      runOnThreads: true,
      logger,
    });
  } catch (error) {
    // A retry after an earlier attempt created the rule but failed to save it.
    if (
      output.confirmationState === "processing" &&
      isDuplicateError(error, "name")
    ) {
      const existingRule = await findRuleForPendingAssistantCreateRule({
        toolInput,
        emailAccountId,
      });
      if (existingRule) return persistConfirmedRule(existingRule.id);
    }

    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      processingAt: reservation.processingAt,
      emailAccountId,
      findPart,
    }).catch((processingError) => {
      logger.error("Failed to clear processing state for create rule", {
        error: processingError,
      });
    });
    logger.error("Failed to confirm assistant create rule", { error });
    throw new SafeError(
      error instanceof Error ? error.message : "Failed to create rule",
    );
  }

  return persistConfirmedRule(rule.id);
}

export async function confirmAssistantSaveMemoryForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  waitForPersistence,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  waitForPersistence?: boolean;
  emailAccountId: string;
  logger: Logger;
}) {
  const findPart = (parts: unknown) =>
    findPendingToolPart({
      parts,
      toolCallId,
      toolType: "tool-saveMemory",
      schema: pendingSaveMemoryToolOutputSchema,
    });

  const reservation = await reservePendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId }),
    findPart,
    getConfirmed: getConfirmationResult,
    logPrefix: "Assistant save memory confirmation",
    waitForPersistence,
    inProgressError: SAVE_MEMORY_CONFIRMATION_IN_PROGRESS_ERROR,
    notFoundError: "Pending memory save not found",
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      content: reservation.value.content,
      confirmationResult: reservation.value,
    };
  }

  const content = reservation.lookup.output.content;
  const existing = await prisma.chatMemory.findFirst({
    where: { emailAccountId, content },
    select: { id: true },
  });

  try {
    if (!existing) {
      await prisma.chatMemory.create({
        data: {
          content,
          chatId,
          emailAccountId,
        },
      });
    }
  } catch (error) {
    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      processingAt: reservation.processingAt,
      emailAccountId,
      findPart,
    }).catch((processingError) => {
      logger.error("Failed to clear processing state for save memory", {
        error: processingError,
      });
    });
    logger.error("Failed to confirm assistant save memory", { error, content });
    throw new SafeError("Failed to save memory");
  }

  const confirmationResult = {
    content,
    confirmedAt: new Date().toISOString(),
    ...(existing ? { deduplicated: true } : {}),
  };

  try {
    await persistConfirmedAssistantPart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      logger: logger.with({
        chatMessageId: reservation.chatMessageId,
        toolCallId,
        content,
      }),
      findPart,
      isConfirmed: (lookup) =>
        getConfirmationResult(lookup)?.content === content,
      buildParts: ({ parts, partIndex }) =>
        updateAssistantPartOutput({
          parts,
          partIndex,
          outputPatch: {
            success: true,
            saved: true,
            actionType: "save_memory",
            requiresConfirmation: true,
            confirmationState: "confirmed",
            content,
            confirmationResult,
          },
        }),
    });
  } catch (persistError) {
    logger.error("Failed to persist confirmed assistant save memory", {
      error: persistError,
      content,
    });
    throw new SafeError(
      "Memory was saved but confirmation state could not be saved. Please refresh and try again.",
    );
  }

  return {
    success: true,
    confirmationState: "confirmed" as const,
    content,
    confirmationResult,
  };
}

export async function confirmAssistantBulkInboxActionForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  waitForPersistence,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  waitForPersistence?: boolean;
  emailAccountId: string;
  logger: Logger;
}) {
  const findPart = (parts: unknown) =>
    findPendingBulkInboxActionPart({ parts, toolCallId });

  const reservation = await reservePendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId }),
    findPart,
    getConfirmed: getConfirmationResult,
    validateLookup: throwIfCancelled,
    logPrefix: "Assistant bulk inbox action confirmation",
    waitForPersistence,
    inProgressError: BULK_INBOX_ACTION_CONFIRMATION_IN_PROGRESS_ERROR,
    notFoundError: "Pending bulk action not found",
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      confirmationResult: reservation.value,
    };
  }

  const { pendingAction } = reservation.lookup.output;

  let jobId: string;
  let createdJobId: string | null = null;
  try {
    // A retried confirmation reuses the job and its current chunk token.
    // Queueing that token again is harmless: a live chunk holds the lease,
    // and a finished one has already moved the token on.
    const confirmationKey = `${reservation.chatMessageId}:${toolCallId}`;
    const existingJob = await prisma.bulkInboxActionJob.findUnique({
      where: {
        emailAccountId_confirmationKey: { emailAccountId, confirmationKey },
      },
      select: { id: true, chunkToken: true },
    });
    const job =
      existingJob ??
      (await prisma.bulkInboxActionJob.create({
        data: {
          emailAccountId,
          chatId,
          confirmationKey,
          search: pendingAction.search,
          action: pendingAction.action,
          labelId: pendingAction.labelId,
          labelName: pendingAction.labelName,
          instruction: pendingAction.instruction,
          chunkToken: randomUUID(),
        },
        select: { id: true, chunkToken: true },
      }));
    if (!existingJob) createdJobId = job.id;
    jobId = job.id;
    if (!job.chunkToken) throw new Error("Bulk inbox action job has no token");
    await enqueueBulkInboxActionChunk({
      jobId,
      chunkToken: job.chunkToken,
      logger,
    });
  } catch (error) {
    // Nothing will run a job that never reached the queue, so don't leave
    // it behind looking like it is running.
    if (createdJobId) {
      await prisma.bulkInboxActionJob
        .delete({ where: { id: createdJobId } })
        .catch((deleteError: unknown) => {
          logger.error("Failed to remove unqueued bulk inbox action job", {
            error: deleteError,
          });
        });
    }
    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      processingAt: reservation.processingAt,
      emailAccountId,
      findPart,
    }).catch((processingError) => {
      logger.error("Failed to clear processing state for bulk inbox action", {
        error: processingError,
      });
    });
    logger.error("Failed to start bulk inbox action", { error });
    throw new SafeError(
      "Couldn't queue the cleanup. Nothing changed, so you can try again.",
    );
  }

  const confirmationResult = { jobId, confirmedAt: new Date().toISOString() };

  let wasDismissed = false;
  try {
    await persistConfirmedAssistantPart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      logger: logger.with({ chatMessageId: reservation.chatMessageId, jobId }),
      findPart,
      isConfirmed: (lookup) =>
        lookup.output.confirmationResult?.jobId === jobId,
      buildParts: ({ parts, partIndex }) => {
        // The user dismissed it after this request's lease expired.
        if (findPart(parts)?.output.confirmationState === "cancelled") {
          wasDismissed = true;
          throw new Error("Bulk inbox action was dismissed");
        }
        return updateAssistantPartOutput({
          parts,
          partIndex,
          outputPatch: { confirmationState: "confirmed", confirmationResult },
        });
      },
    });
  } catch (error) {
    if (wasDismissed) {
      await prisma.bulkInboxActionJob.updateMany({
        where: { id: jobId, emailAccountId, status: "RUNNING" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      throw new SafeError("This action was cancelled.");
    }
    // The job is queued and runs either way, so the card should show its
    // progress. After a reload the stored part is still processing; once that
    // lease expires, confirming again reuses this job and saves it.
    logger.error("Failed to persist confirmed bulk inbox action", {
      error,
      jobId,
    });
  }

  return {
    success: true,
    confirmationState: "confirmed" as const,
    confirmationResult,
  };
}

/** Records that the user dismissed a pending bulk action, so chat knows nothing ran. */
export async function dismissAssistantBulkInboxActionForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  return dismissPendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId }),
    findPart: (parts) => findPendingBulkInboxActionPart({ parts, toolCallId }),
    logPrefix: "Assistant bulk inbox action dismissal",
    notFoundError: "Pending bulk action not found",
    // A start whose processing lease expired never saved its job, though it
    // may have queued one. Cancelling it stops that job too.
    cancelAbandonedStart: async (resolvedChatMessageId) => {
      await prisma.bulkInboxActionJob.updateMany({
        where: {
          emailAccountId,
          confirmationKey: `${resolvedChatMessageId}:${toolCallId}`,
          status: "RUNNING",
        },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    },
  });
}

export async function confirmAssistantTrashThreadsForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  waitForPersistence,
  emailAccountId,
  provider,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  waitForPersistence?: boolean;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const findPart = (parts: unknown) =>
    findPendingTrashThreadsPart({ parts, toolCallId });

  const reservation = await reservePendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId }),
    findPart,
    getConfirmed: getConfirmationResult,
    validateLookup: throwIfCancelled,
    logPrefix: "Assistant trash confirmation",
    waitForPersistence,
    inProgressError: TRASH_THREADS_CONFIRMATION_IN_PROGRESS_ERROR,
    notFoundError: "Pending trash action not found",
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      confirmationResult: reservation.value,
    };
  }

  const { actionType, pendingAction } = reservation.lookup.output;
  const { threadIds } = pendingAction;
  const isTrash = actionType === "trash_threads";

  let threadResult: Awaited<ReturnType<typeof trashChatThreads>> & {
    deletedDraftCount?: number;
  };
  try {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { email: true },
    });
    if (!emailAccount) throw new Error("Email account not found");
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    threadResult = isTrash
      ? await trashChatThreads({
          emailProvider,
          threadIds,
          email: emailAccount.email,
        })
      : await deleteChatDrafts({ emailProvider, threadIds });
    // Gmail push skips draft changes, so open mail views would keep showing
    // deleted drafts until their next idle sync. A thread that failed can
    // still have had some of its drafts deleted, and one with no drafts left
    // succeeds without changing anything.
    if (
      isTrash
        ? threadResult.successCount > 0
        : (threadResult.deletedDraftCount ?? 0) > 0
    ) {
      await notifyMailboxChanged({ emailAccountId, logger });
    }
    // Nothing changed, so the card stays pending and can be confirmed again.
    if (threadResult.successCount === 0) {
      throw new Error(`No threads were changed by ${actionType}`);
    }
  } catch (error) {
    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      processingAt: reservation.processingAt,
      emailAccountId,
      findPart,
    }).catch((processingError) => {
      logger.error("Failed to clear processing state for trash", {
        error: processingError,
      });
    });
    logger.error("Failed to confirm assistant trash", { error, actionType });
    throw new SafeError(
      isTrash
        ? "Couldn't move these emails to trash. Try again."
        : "Couldn't delete these drafts. Try again.",
    );
  }

  const confirmationResult = {
    successCount: threadResult.successCount,
    failedThreadIds: threadResult.failedThreadIds,
    confirmedAt: new Date().toISOString(),
  };

  let savedByThisRequest: boolean;
  try {
    savedByThisRequest = await persistConfirmedAssistantPart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      logger: logger.with({ chatMessageId: reservation.chatMessageId }),
      findPart,
      isConfirmed: (lookup) => lookup.output.confirmationState === "confirmed",
      buildParts: ({ parts, partIndex }) =>
        updateAssistantPartOutput({
          parts,
          partIndex,
          outputPatch: { confirmationState: "confirmed", confirmationResult },
        }),
    });
  } catch (error) {
    logger.error("Failed to persist confirmed assistant trash", { error });
    throw new SafeError(
      isTrash
        ? "Emails were moved to trash but confirmation state could not be saved. Please refresh."
        : "Drafts were deleted but confirmation state could not be saved. Please refresh.",
    );
  }

  // Counted only by the request that saved the result, so a retry or an
  // overlapping confirmation can't count the same trash twice.
  if (savedByThisRequest) {
    await addChatActionTotals({
      chatId,
      counts: isTrash
        ? { threads_trashed: threadResult.successCount }
        : { drafts_deleted: threadResult.deletedDraftCount ?? 0 },
    }).catch((error: unknown) => {
      logger.error("Failed to update chat action totals", { error });
    });
  }

  return {
    success: true,
    confirmationState: "confirmed" as const,
    confirmationResult,
  };
}

/** Records that the user declined a pending trash, so chat knows nothing moved. */
export async function dismissAssistantTrashThreadsForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  // No cancelAbandonedStart: once a confirmation starts, some emails may
  // already be in trash, so "nothing changed" would no longer be true.
  return dismissPendingAssistantPart({
    chatId,
    chatMessageId,
    emailAccountId,
    logger: logger.with({ toolCallId }),
    findPart: (parts) => findPendingTrashThreadsPart({ parts, toolCallId }),
    logPrefix: "Assistant trash dismissal",
    notFoundError: "Pending trash action not found",
  });
}

async function executeAssistantEmailAction({
  output,
  emailProvider,
  emailAccountId,
  contentOverride,
}: {
  output: AssistantPendingEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  emailAccountId: string;
  contentOverride?: string;
}): Promise<AssistantEmailConfirmationResult> {
  const confirmedAt = new Date().toISOString();

  switch (output.actionType) {
    case "send_email":
      return confirmPendingSendEmailAction({
        output,
        emailProvider,
        emailAccountId,
        confirmedAt,
        contentOverride,
      });
    case "reply_email":
      return confirmPendingReplyEmailAction({
        output,
        emailProvider,
        emailAccountId,
        confirmedAt,
        contentOverride,
      });
    case "forward_email":
      return confirmPendingForwardEmailAction({
        output,
        emailProvider,
        emailAccountId,
        confirmedAt,
        contentOverride,
      });
  }
}

async function confirmPendingSendEmailAction({
  output,
  emailProvider,
  emailAccountId,
  confirmedAt,
  contentOverride,
}: {
  output: PendingSendEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  emailAccountId: string;
  confirmedAt: string;
  contentOverride?: string;
}) {
  const from =
    output.pendingAction.from ||
    (await getFormattedSenderAddress({ emailAccountId }));

  const messageHtml = contentOverride
    ? convertNewlinesToBr(escapeHtml(contentOverride))
    : output.pendingAction.messageHtml;
  const sentAfter = new Date();

  const result = await emailProvider.sendEmailWithHtml({
    to: output.pendingAction.to,
    cc: output.pendingAction.cc || undefined,
    bcc: output.pendingAction.bcc || undefined,
    subject: output.pendingAction.subject,
    messageHtml,
    ...(from ? { from } : {}),
  });
  const messageId = await resolveSentMessageId({
    emailProvider,
    messageId: result.messageId,
    threadId: result.threadId,
    sentAfter,
  });

  return {
    actionType: output.actionType,
    messageId,
    threadId: result.threadId || null,
    to: output.pendingAction.to,
    subject: output.pendingAction.subject,
    confirmedAt,
  };
}

async function confirmPendingReplyEmailAction({
  output,
  emailProvider,
  emailAccountId,
  confirmedAt,
  contentOverride,
}: {
  output: PendingReplyEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  emailAccountId: string;
  confirmedAt: string;
  contentOverride?: string;
}) {
  const sourceMessage = await emailProvider.getMessage(
    output.pendingAction.messageId,
  );
  const message = applyReferenceThreadIdFallback(
    sourceMessage,
    output.reference?.threadId,
  );
  const from = await getFormattedSenderAddress({ emailAccountId });
  const replyOptions = from ? { from } : undefined;
  const sentAfter = new Date();
  await emailProvider.replyToEmail(
    message,
    escapeHtml(contentOverride || output.pendingAction.content),
    replyOptions,
  );

  const messageId = await resolveSentMessageId({
    emailProvider,
    threadId: message.threadId,
    sentAfter,
  });

  return {
    actionType: output.actionType,
    messageId,
    threadId: message.threadId || null,
    to: message.headers["reply-to"] || message.headers.from || null,
    subject: message.subject || message.headers.subject || null,
    confirmedAt,
  };
}

async function confirmPendingForwardEmailAction({
  output,
  emailProvider,
  emailAccountId,
  confirmedAt,
  contentOverride,
}: {
  output: PendingForwardEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  emailAccountId: string;
  confirmedAt: string;
  contentOverride?: string;
}) {
  const sourceMessage = await emailProvider.getMessage(
    output.pendingAction.messageId,
  );
  const message = applyReferenceThreadIdFallback(
    sourceMessage,
    output.reference?.threadId,
  );
  const sentAfter = new Date();
  await forwardMessage({
    emailProvider,
    emailAccountId,
    message,
    to: output.pendingAction.to,
    cc: output.pendingAction.cc,
    bcc: output.pendingAction.bcc,
    content: contentOverride || output.pendingAction.content,
  });

  const messageId = await resolveSentMessageId({
    emailProvider,
    threadId: message.threadId,
    sentAfter,
  });

  return {
    actionType: output.actionType,
    messageId,
    threadId: message.threadId || null,
    to: output.pendingAction.to,
    subject: message.subject || message.headers.subject || null,
    confirmedAt,
  };
}

function findPendingToolPart<TOutput>({
  parts,
  toolCallId,
  toolType,
  schema,
}: {
  parts: unknown;
  toolCallId: string;
  toolType: string;
  schema: z.ZodType<TOutput>;
}) {
  if (!Array.isArray(parts)) return null;

  for (const [index, part] of parts.entries()) {
    if (
      !isRecord(part) ||
      part.type !== toolType ||
      part.toolCallId !== toolCallId
    ) {
      continue;
    }

    const parsed = schema.safeParse(part.output);
    if (parsed.success) {
      return { index, output: parsed.data, parts, toolInput: part.input };
    }
  }

  return null;
}

function findPendingBulkInboxActionPart({
  parts,
  toolCallId,
}: {
  parts: unknown;
  toolCallId: string;
}) {
  return findPendingToolPart({
    parts,
    toolCallId,
    toolType: "tool-bulkManageInbox",
    schema: pendingBulkInboxActionToolOutputSchema,
  });
}

function findPendingTrashThreadsPart({
  parts,
  toolCallId,
}: {
  parts: unknown;
  toolCallId: string;
}) {
  return findPendingToolPart({
    parts,
    toolCallId,
    toolType: "tool-manageInbox",
    schema: pendingTrashThreadsToolOutputSchema,
  });
}

function getConfirmationResult<TResult>(lookup: {
  output: { confirmationState: string; confirmationResult?: TResult };
}) {
  return lookup.output.confirmationState === "confirmed"
    ? (lookup.output.confirmationResult ?? null)
    : null;
}

function throwIfCancelled(lookup: { output: { confirmationState: string } }) {
  if (lookup.output.confirmationState === "cancelled") {
    throw new SafeError("This action was cancelled.");
  }
}

async function findChatMessageForPendingAction({
  chatId,
  chatMessageId,
  emailAccountId,
  logger,
  matchParts,
  logPrefix,
  waitForPersistenceMs,
}: {
  chatId: string;
  chatMessageId?: string;
  emailAccountId: string;
  logger: Logger;
  matchParts: (parts: unknown) => boolean;
  logPrefix: string;
  waitForPersistenceMs?: number;
}) {
  const startedAt = Date.now();
  let attemptCount = 0;

  while (true) {
    attemptCount += 1;

    const hintedChatMessage = chatMessageId
      ? await prisma.chatMessage.findFirst({
          where: {
            id: chatMessageId,
            chat: { id: chatId, emailAccountId },
          },
          select: {
            id: true,
            chatId: true,
            updatedAt: true,
            parts: true,
          },
        })
      : null;

    if (hintedChatMessage && matchParts(hintedChatMessage.parts)) {
      if (attemptCount > 1) {
        logger.info(`${logPrefix} resolved after persistence wait`, {
          chatId,
          requestedChatMessageId: chatMessageId,
          resolvedChatMessageId: hintedChatMessage.id,
          waitedMs: Date.now() - startedAt,
          lookupAttempts: attemptCount,
        });
      }
      return hintedChatMessage;
    }

    const assistantMessages = await prisma.chatMessage.findMany({
      where: {
        role: "assistant",
        chat: { id: chatId, emailAccountId },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        chatId: true,
        updatedAt: true,
        parts: true,
      },
    });

    const matchingMessages = assistantMessages.filter((message) =>
      matchParts(message.parts),
    );

    if (matchingMessages.length === 1) {
      if (attemptCount > 1) {
        logger.info(`${logPrefix} resolved after persistence wait`, {
          chatId,
          requestedChatMessageId: chatMessageId,
          resolvedChatMessageId: matchingMessages[0].id,
          waitedMs: Date.now() - startedAt,
          lookupAttempts: attemptCount,
        });
      } else if (chatMessageId && matchingMessages[0].id !== chatMessageId) {
        logger.warn(`${logPrefix} resolved pending action by tool lookup`, {
          chatId,
          requestedChatMessageId: chatMessageId,
          resolvedChatMessageId: matchingMessages[0].id,
        });
      }
      return matchingMessages[0];
    }

    if (matchingMessages.length > 1) {
      logger.warn(`${logPrefix} found multiple pending action matches`, {
        chatId,
        requestedChatMessageId: chatMessageId,
        matchedChatMessageIds: matchingMessages.map((message) => message.id),
      });
      return matchingMessages[0];
    }

    const waitedMs = Date.now() - startedAt;
    if (waitForPersistenceMs && waitedMs < waitForPersistenceMs) {
      await sleep(
        Math.min(
          PENDING_ACTION_POLL_INTERVAL_MS,
          waitForPersistenceMs - waitedMs,
        ),
      );
      continue;
    }

    logger.warn(`${logPrefix} pending action not found`, {
      chatId,
      requestedChatMessageId: chatMessageId,
      hintedMessageFound: Boolean(hintedChatMessage),
      assistantMessageCount: assistantMessages.length,
      waitedMs,
      lookupAttempts: attemptCount,
    });

    return null;
  }
}

async function dismissPendingAssistantPart({
  chatId,
  chatMessageId,
  emailAccountId,
  logger,
  findPart,
  logPrefix,
  notFoundError,
  cancelAbandonedStart,
}: {
  chatId: string;
  chatMessageId?: string;
  emailAccountId: string;
  logger: Logger;
  findPart: (parts: unknown) => {
    index: number;
    parts: unknown[];
    output: {
      confirmationState: string;
      confirmationProcessingAt?: string | null;
    };
  } | null;
  logPrefix: string;
  notFoundError: string;
  /** Lets a start whose processing lease expired be dismissed, after undoing what it may have begun. */
  cancelAbandonedStart?: (chatMessageId: string) => Promise<void>;
}) {
  const chatMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: (parts) => !!findPart(parts),
    logPrefix,
  });
  const lookup = chatMessage ? findPart(chatMessage.parts) : null;
  if (!chatMessage || !lookup) throw new SafeError(notFoundError);

  const state = lookup.output.confirmationState;
  if (state === "cancelled") return { confirmationState: "cancelled" as const };

  const isAbandonedStart =
    !!cancelAbandonedStart &&
    state === "processing" &&
    hasProcessingLeaseExpired(lookup.output.confirmationProcessingAt);
  if (state !== "pending" && !isAbandonedStart) {
    throw new SafeError("This action has already started.");
  }
  const { confirmationProcessingAt } = lookup.output;

  // Saved before cancelling the job, so a confirmation that took over the
  // expired lease in the meantime makes this dismissal fail instead.
  await persistConfirmedAssistantPart({
    chatMessageId: chatMessage.id,
    emailAccountId,
    logger: logger.with({ chatMessageId: chatMessage.id }),
    findPart,
    isConfirmed: (current) => current.output.confirmationState === "cancelled",
    buildParts: ({ parts, partIndex }) => {
      const current = findPart(parts)?.output;
      if (
        current?.confirmationState !== state ||
        current.confirmationProcessingAt !== confirmationProcessingAt
      ) {
        throw new SafeError("This action has already started.");
      }
      return updateAssistantPartOutput({
        parts,
        partIndex,
        outputPatch: { confirmationState: "cancelled" },
      });
    },
  });

  if (isAbandonedStart) await cancelAbandonedStart(chatMessage.id);

  return { confirmationState: "cancelled" as const };
}

async function reservePendingAssistantPart<
  TLookup extends {
    index: number;
    parts: unknown[];
    output: {
      confirmationState: string;
      confirmationProcessingAt?: string | null;
    };
  },
  TConfirmed,
>({
  chatId,
  chatMessageId,
  emailAccountId,
  logger,
  findPart,
  getConfirmed,
  validateLookup,
  logPrefix,
  waitForPersistence,
  persistenceWaitMs = PENDING_ACTION_PERSIST_WAIT_MS,
  inProgressError,
  notFoundError,
}: {
  chatId: string;
  chatMessageId?: string;
  emailAccountId: string;
  logger: Logger;
  findPart: (parts: unknown) => TLookup | null;
  getConfirmed: (lookup: TLookup) => TConfirmed | null;
  validateLookup?: (lookup: TLookup) => void;
  logPrefix: string;
  waitForPersistence?: boolean;
  persistenceWaitMs?: number;
  inProgressError: string;
  notFoundError: string;
}): Promise<
  | { status: "confirmed"; value: TConfirmed }
  | {
      status: "reserved";
      chatMessageId: string;
      lookup: TLookup;
      processingAt: string;
    }
> {
  const findMessage = () =>
    findChatMessageForPendingAction({
      chatId,
      chatMessageId,
      emailAccountId,
      logger,
      matchParts: (parts) => !!findPart(parts),
      logPrefix,
      waitForPersistenceMs: waitForPersistence ? persistenceWaitMs : undefined,
    });

  const chatMessage = await findMessage();
  if (!chatMessage) {
    logger.warn(`${logPrefix} failed: chat message not found`, {
      chatMessageId,
    });
    throw new SafeError("Chat message not found");
  }

  const lookup = findPart(chatMessage.parts);
  if (!lookup) {
    logger.warn(`${logPrefix} failed: pending action not found`, {
      chatMessageId: chatMessage.id,
    });
    throw new SafeError(notFoundError);
  }

  const confirmed = getConfirmed(lookup);
  if (confirmed !== null) {
    return { status: "confirmed", value: confirmed };
  }

  validateLookup?.(lookup);

  if (
    lookup.output.confirmationState === "processing" &&
    !hasProcessingLeaseExpired(lookup.output.confirmationProcessingAt)
  ) {
    throw new SafeError(inProgressError);
  }

  const processingAt = new Date().toISOString();
  const processingParts = updateAssistantPartOutput({
    parts: lookup.parts,
    partIndex: lookup.index,
    outputPatch: {
      confirmationState: "processing",
      confirmationProcessingAt: processingAt,
    },
  });

  const claim = await prisma.chatMessage.updateMany({
    where: {
      id: chatMessage.id,
      chatId: chatMessage.chatId,
      updatedAt: chatMessage.updatedAt,
    },
    data: {
      parts: processingParts as Prisma.InputJsonValue,
    },
  });

  if (claim.count === 1) {
    return {
      status: "reserved",
      chatMessageId: chatMessage.id,
      lookup,
      processingAt,
    };
  }

  const latestMessage = await findMessage();
  if (!latestMessage) {
    logger.warn(`${logPrefix} failed after reservation race`, {
      chatMessageId: chatMessage.id,
    });
    throw new SafeError("Chat message not found");
  }

  const latestLookup = findPart(latestMessage.parts);
  if (latestLookup) {
    const latestConfirmed = getConfirmed(latestLookup);
    if (latestConfirmed !== null) {
      return { status: "confirmed", value: latestConfirmed };
    }
  }

  throw new SafeError(inProgressError);
}

/** Returns a failed confirmation to pending, unless another request has since taken over its lease. */
async function clearPendingPartProcessing({
  chatMessageId,
  processingAt,
  emailAccountId,
  findPart,
}: {
  chatMessageId?: string;
  processingAt: string;
  emailAccountId: string;
  findPart: (parts: unknown) => {
    index: number;
    output: {
      confirmationState: string;
      confirmationProcessingAt?: string | null;
    };
    parts: unknown[];
  } | null;
}) {
  const chatMessage = await prisma.chatMessage.findFirst({
    where: {
      id: chatMessageId,
      chat: { emailAccountId },
    },
    select: {
      id: true,
      chatId: true,
      updatedAt: true,
      parts: true,
    },
  });

  if (!chatMessage) return;

  const lookup = findPart(chatMessage.parts);
  if (
    lookup?.output.confirmationState !== "processing" ||
    lookup.output.confirmationProcessingAt !== processingAt
  ) {
    return;
  }

  const pendingParts = updateAssistantPartOutput({
    parts: lookup.parts,
    partIndex: lookup.index,
    outputPatch: { confirmationState: "pending" },
  });

  await prisma.chatMessage.updateMany({
    where: {
      id: chatMessage.id,
      chatId: chatMessage.chatId,
      updatedAt: chatMessage.updatedAt,
    },
    data: { parts: pendingParts as Prisma.InputJsonValue },
  });
}

async function resolveSentMessageId({
  emailProvider,
  messageId,
  threadId,
  sentAfter,
}: {
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  messageId?: string | null;
  threadId?: string | null;
  sentAfter?: Date;
}) {
  if (messageId) return messageId;
  if (!threadId || !sentAfter) return null;

  const sentAfterWithLookback = new Date(
    sentAfter.getTime() - SENT_MESSAGE_RESOLVE_LOOKBACK_MS,
  );

  for (
    let attempt = 0;
    attempt < SENT_MESSAGE_RESOLVE_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const sentMessagePage = await emailProvider.getSentMessageIds({
        maxResults: 20,
        after: sentAfterWithLookback,
        before: new Date(),
      });

      const matchingThreadIds = sentMessagePage.messages.filter(
        (sentMessage) => sentMessage.threadId === threadId,
      );

      if (matchingThreadIds.length === 1) {
        return matchingThreadIds[0].id;
      }

      if (matchingThreadIds.length > 1) {
        return null;
      }
    } catch {}

    if (attempt < SENT_MESSAGE_RESOLVE_MAX_ATTEMPTS - 1) {
      await sleep(SENT_MESSAGE_RESOLVE_RETRY_MS);
    }
  }

  return null;
}

function getAssistantEmailActionErrorMessage(
  actionType: AssistantPendingEmailActionType,
  error?: unknown,
) {
  const fallback = ASSISTANT_EMAIL_ACTION_METADATA[actionType].errorMessage;
  const providerErrorMessage = getProviderErrorMessage(error);

  return providerErrorMessage
    ? `${fallback}: ${providerErrorMessage}`
    : fallback;
}

function getProviderErrorMessage(error: unknown): string | null {
  if (!isRecord(error)) return null;

  const raw = extractRawProviderErrorMessage(error);
  return raw ? sanitizeProviderErrorMessage(raw) : null;
}

function extractRawProviderErrorMessage(
  error: Record<string, unknown>,
): string | null {
  const bodyMessage = getProviderErrorBodyMessage(error.body);
  if (bodyMessage) return bodyMessage;

  const nestedError = error.error;
  if (isRecord(nestedError) && typeof nestedError.message === "string") {
    return nestedError.message;
  }

  const hasMetadata = Boolean(
    error.status ||
      error.statusCode ||
      error.code ||
      error.body ||
      error.response ||
      error.data,
  );
  if (
    hasMetadata &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return null;
}

function getProviderErrorBodyMessage(body: unknown): string | null {
  if (typeof body !== "string" || !body.trim()) return null;

  try {
    const parsed = JSON.parse(body);
    if (!isRecord(parsed)) return null;

    const error = parsed.error;
    if (isRecord(error) && typeof error.message === "string") {
      return error.message;
    }

    if (typeof parsed.message === "string") return parsed.message;
  } catch {}

  return body;
}

function sanitizeProviderErrorMessage(message: string) {
  const sanitized = message
    .replace(/[\w.%+-]+@[\w.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return null;
  return truncate(sanitized, 237);
}

function updateAssistantPartOutput({
  parts,
  partIndex,
  outputPatch,
  pendingActionPatch,
}: {
  parts: unknown[];
  partIndex: number;
  outputPatch: Record<string, unknown>;
  pendingActionPatch?: Record<string, unknown>;
}) {
  return parts.map((part, index) => {
    if (index !== partIndex || !isRecord(part)) return part;

    const existingOutput = isRecord(part.output) ? part.output : {};
    const outputWithoutProcessing =
      getOutputWithoutProcessingMetadata(existingOutput);

    const patchedOutput = {
      ...outputWithoutProcessing,
      ...outputPatch,
    };

    if (pendingActionPatch && isRecord(patchedOutput.pendingAction)) {
      patchedOutput.pendingAction = {
        ...patchedOutput.pendingAction,
        ...pendingActionPatch,
      };
    }

    return {
      ...part,
      output: patchedOutput,
    };
  });
}

function hasProcessingLeaseExpired(processingAt?: string | null) {
  if (!processingAt) return false;

  const processingTime = Date.parse(processingAt);
  if (Number.isNaN(processingTime)) return false;

  return (
    Date.now() - processingTime >= ASSISTANT_CONFIRMATION_PROCESSING_LEASE_MS
  );
}

async function persistConfirmedAssistantPart<
  TLookup extends { index: number; parts: unknown[] },
>({
  chatMessageId,
  emailAccountId,
  logger,
  findPart,
  isConfirmed,
  buildParts,
}: {
  chatMessageId: string;
  emailAccountId: string;
  logger: Logger;
  findPart: (parts: unknown) => TLookup | null;
  isConfirmed?: (lookup: TLookup) => boolean;
  buildParts: (args: { parts: unknown[]; partIndex: number }) => unknown[];
}) {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= CONFIRMATION_PERSIST_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const chatMessage = await prisma.chatMessage.findFirst({
        where: {
          id: chatMessageId,
          chat: { emailAccountId },
        },
        select: {
          id: true,
          chatId: true,
          updatedAt: true,
          parts: true,
        },
      });

      if (!chatMessage) {
        throw new Error("Chat message not found");
      }

      const lookup = findPart(chatMessage.parts);

      if (!lookup) {
        throw new Error("Pending assistant action not found");
      }

      if (isConfirmed?.(lookup)) {
        return false;
      }

      const updatedParts = buildParts({
        parts: lookup.parts,
        partIndex: lookup.index,
      });

      const persisted = await prisma.chatMessage.updateMany({
        where: {
          id: chatMessage.id,
          chatId: chatMessage.chatId,
          updatedAt: chatMessage.updatedAt,
        },
        data: { parts: updatedParts as Prisma.InputJsonValue },
      });

      if (persisted.count === 1) {
        return true;
      }

      logger.warn("Assistant confirmation persistence lost update race", {
        attempt,
      });
    } catch (error) {
      lastError = error;
      logger.warn("Assistant confirmation persistence attempt failed", {
        attempt,
        error,
      });
    }
  }

  throw lastError ?? new Error("Failed to persist confirmed assistant action");
}

async function findRuleForPendingAssistantCreateRule({
  toolInput,
  emailAccountId,
}: {
  toolInput: unknown;
  emailAccountId: string;
}) {
  if (!isRecord(toolInput) || typeof toolInput.name !== "string") return null;

  const ruleName = toolInput.name.trim();
  if (!ruleName) return null;

  return prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId,
      },
    },
    select: { id: true },
  });
}

function getOutputWithoutProcessingMetadata(output: Record<string, unknown>) {
  const { confirmationProcessingAt: _, ...rest } = output;
  return rest;
}

function applyReferenceThreadIdFallback<T extends { threadId?: string | null }>(
  message: T,
  fallbackThreadId?: string | null,
) {
  if (message.threadId || !fallbackThreadId) return message;

  return {
    ...message,
    threadId: fallbackThreadId,
  };
}

function getPendingActionContentPatch(
  actionType: AssistantPendingEmailActionType,
  contentOverride: string,
): Record<string, string> {
  if (actionType === "send_email") {
    return { messageHtml: convertNewlinesToBr(escapeHtml(contentOverride)) };
  }
  return { content: contentOverride };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
