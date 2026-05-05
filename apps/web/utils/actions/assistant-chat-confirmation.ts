import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";
import { convertNewlinesToBr, escapeHtml } from "@/utils/string";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  type AssistantEmailConfirmationResult,
  type AssistantPendingEmailActionType,
  type AssistantPendingEmailToolOutput,
  pendingCreateRuleToolOutputSchema,
  pendingForwardEmailToolOutputSchema,
  pendingReplyEmailToolOutputSchema,
  pendingSaveMemoryToolOutputSchema,
  pendingSendEmailToolOutputSchema,
  type PendingForwardEmailToolOutput,
  type PendingReplyEmailToolOutput,
  type PendingSendEmailToolOutput,
} from "./assistant-chat.validation";
import {
  buildCreateRuleSchemaFromChatToolInput,
  type ChatCreateRuleToolInvocation,
} from "@/utils/ai/assistant/tools/rules/shared";
import { createRule } from "@/utils/rule/rule";

const CONFIRMATION_IN_PROGRESS_ERROR =
  "Email action confirmation already in progress";
const SAVE_MEMORY_CONFIRMATION_IN_PROGRESS_ERROR =
  "Memory save confirmation already in progress";
const CONFIRMATION_PROCESSING_LEASE_MS = 5 * 60 * 1000;
const CONFIRMATION_PERSIST_MAX_ATTEMPTS = 3;
const PENDING_ACTION_PERSIST_WAIT_MS = 2000;
const PENDING_ACTION_POLL_INTERVAL_MS = 250;
const SENT_MESSAGE_RESOLVE_MAX_ATTEMPTS = 5;
const SENT_MESSAGE_RESOLVE_RETRY_MS = 500;
const SENT_MESSAGE_RESOLVE_LOOKBACK_MS = 60 * 1000;

const ASSISTANT_EMAIL_ACTION_METADATA: Record<
  AssistantPendingEmailActionType,
  {
    toolType: string;
    errorMessage: string;
    parseOutput: (output: unknown) => AssistantPendingEmailToolOutput | null;
  }
> = {
  send_email: {
    toolType: "tool-sendEmail",
    errorMessage: "Failed to send email",
    parseOutput: parsePendingSendEmailOutput,
  },
  reply_email: {
    toolType: "tool-replyEmail",
    errorMessage: "Failed to send reply",
    parseOutput: parsePendingReplyEmailOutput,
  },
  forward_email: {
    toolType: "tool-forwardEmail",
    errorMessage: "Failed to forward email",
    parseOutput: parsePendingForwardEmailOutput,
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
  const reservation = await reservePendingAssistantEmailAction({
    chatId,
    chatMessageId,
    toolCallId,
    actionType,
    emailAccountId,
    waitForPersistence,
    persistenceWaitMs,
    logger,
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      actionType,
      confirmationResult: reservation.confirmationResult,
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
      output: reservation.output,
      emailProvider,
      emailAccountId,
      contentOverride,
    });
  } catch (error) {
    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      findPart: (parts) =>
        findPendingAssistantEmailPart({ parts, toolCallId, actionType }),
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
    throw new SafeError(getAssistantEmailActionErrorMessage(actionType));
  }

  try {
    await persistConfirmedAssistantEmailActionPart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      toolCallId,
      actionType,
      confirmationResult,
      contentOverride,
      logger,
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
  const reservation = await reservePendingAssistantCreateRule({
    chatId,
    chatMessageId,
    toolCallId,
    emailAccountId,
    waitForPersistence,
    logger,
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      ruleId: reservation.ruleId,
    };
  }

  const toolInput = reservation.toolInput;
  if (!isRecord(toolInput)) {
    throw new SafeError("Invalid create-rule tool input");
  }

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
      enablement: { source: "chat", chatRiskConfirmed: true },
    });
  } catch (error) {
    if (
      reservation.output.confirmationState === "processing" &&
      isDuplicateError(error, "name")
    ) {
      const existingRule = await findRuleForPendingAssistantCreateRule({
        toolInput,
        emailAccountId,
      });

      if (existingRule) {
        const confirmedAt = new Date().toISOString();
        try {
          await persistConfirmedAssistantCreateRulePart({
            chatMessageId: reservation.chatMessageId,
            emailAccountId,
            toolCallId,
            riskMessages: reservation.output.riskMessages,
            ruleId: existingRule.id,
            confirmedAt,
            logger,
          });
        } catch (persistError) {
          logger.error("Failed to persist confirmed assistant create rule", {
            error: persistError,
            ruleId: existingRule.id,
          });
          throw new SafeError(
            "Rule was created but confirmation state could not be saved. Please refresh and try again.",
          );
        }

        return {
          success: true,
          confirmationState: "confirmed" as const,
          ruleId: existingRule.id,
          confirmationResult: { ruleId: existingRule.id, confirmedAt },
        };
      }
    }

    await clearPendingPartProcessing({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      findPart: (parts) =>
        findPendingAssistantCreateRulePart({ parts, toolCallId }),
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

  const confirmedAt = new Date().toISOString();
  try {
    await persistConfirmedAssistantCreateRulePart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      toolCallId,
      riskMessages: reservation.output.riskMessages,
      ruleId: rule.id,
      confirmedAt,
      logger,
    });
  } catch (persistError) {
    logger.error("Failed to persist confirmed assistant create rule", {
      error: persistError,
      ruleId: rule.id,
    });
    throw new SafeError(
      "Rule was created but confirmation state could not be saved. Please refresh and try again.",
    );
  }

  return {
    success: true,
    confirmationState: "confirmed" as const,
    ruleId: rule.id,
    confirmationResult: { ruleId: rule.id, confirmedAt },
  };
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
  const reservation = await reservePendingAssistantSaveMemory({
    chatId,
    chatMessageId,
    toolCallId,
    emailAccountId,
    waitForPersistence,
    logger,
  });

  if (reservation.status === "confirmed") {
    return {
      success: true,
      confirmationState: "confirmed" as const,
      content: reservation.content,
      confirmationResult: reservation.confirmationResult,
    };
  }

  const content = reservation.output.content;
  const existing = await prisma.chatMemory.findFirst({
    where: { emailAccountId, content },
    select: { id: true },
  });

  const confirmedAt = new Date().toISOString();

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
      emailAccountId,
      findPart: (parts) =>
        findPendingAssistantSaveMemoryPart({ parts, toolCallId }),
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
    confirmedAt,
    ...(existing ? { deduplicated: true } : {}),
  };

  try {
    await persistConfirmedAssistantSaveMemoryPart({
      chatMessageId: reservation.chatMessageId,
      emailAccountId,
      toolCallId,
      content,
      confirmedAt,
      deduplicated: Boolean(existing),
      logger,
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
    contentOverride || output.pendingAction.content,
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
  const from = await getFormattedSenderAddress({ emailAccountId });
  const forwardArgs = {
    to: output.pendingAction.to,
    cc: output.pendingAction.cc || undefined,
    bcc: output.pendingAction.bcc || undefined,
    content: contentOverride || output.pendingAction.content || undefined,
    ...(from ? { from } : {}),
  };
  const sentAfter = new Date();
  await emailProvider.forwardEmail(message, forwardArgs);

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

const ASSISTANT_CREATE_RULE_TOOL_TYPE = "tool-createRule";

function findPendingAssistantCreateRulePart({
  parts,
  toolCallId,
}: {
  parts: unknown;
  toolCallId: string;
}) {
  if (!Array.isArray(parts)) return null;

  for (const [index, part] of parts.entries()) {
    if (
      !isRecord(part) ||
      part.type !== ASSISTANT_CREATE_RULE_TOOL_TYPE ||
      part.toolCallId !== toolCallId
    ) {
      continue;
    }

    const parsed = pendingCreateRuleToolOutputSchema.safeParse(part.output);
    if (!parsed.success) continue;

    const out = parsed.data;
    if (!out.requiresConfirmation || out.actionType !== "create_rule") {
      continue;
    }

    return {
      index,
      output: out,
      parts,
      toolInput: part.input,
    };
  }

  return null;
}

function findPendingAssistantSaveMemoryPart({
  parts,
  toolCallId,
}: {
  parts: unknown;
  toolCallId: string;
}) {
  if (!Array.isArray(parts)) return null;

  for (const [index, part] of parts.entries()) {
    if (
      !isRecord(part) ||
      part.type !== "tool-saveMemory" ||
      part.toolCallId !== toolCallId
    ) {
      continue;
    }

    const parsed = pendingSaveMemoryToolOutputSchema.safeParse(part.output);
    if (!parsed.success) continue;

    const out = parsed.data;
    if (!out.requiresConfirmation || out.actionType !== "save_memory") {
      continue;
    }

    return {
      index,
      output: out,
      parts,
      toolInput: part.input,
    };
  }

  return null;
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

function findPendingAssistantEmailPart({
  parts,
  toolCallId,
  actionType,
}: {
  parts: unknown;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
}) {
  if (!Array.isArray(parts)) return null;

  const expectedToolType = getAssistantToolTypeForAction(actionType);
  for (const [index, part] of parts.entries()) {
    if (
      !isRecord(part) ||
      part.type !== expectedToolType ||
      part.toolCallId !== toolCallId
    ) {
      continue;
    }

    const parsedOutput = parsePendingAssistantEmailOutput({
      actionType,
      output: part.output,
    });
    if (!parsedOutput) return null;

    return {
      index,
      output: parsedOutput,
      parts,
    };
  }

  return null;
}

function updateAssistantEmailPartWithConfirmation({
  parts,
  partIndex,
  confirmationResult,
  contentOverride,
}: {
  parts: unknown[];
  partIndex: number;
  confirmationResult: AssistantEmailConfirmationResult;
  contentOverride?: string;
}) {
  return updateAssistantEmailPartOutput({
    parts,
    partIndex,
    outputPatch: {
      success: true,
      confirmationState: "confirmed",
      confirmationResult,
    },
    pendingActionPatch: contentOverride
      ? getPendingActionContentPatch(
          confirmationResult.actionType,
          contentOverride,
        )
      : undefined,
  });
}

function updateAssistantEmailPartWithProcessing({
  parts,
  partIndex,
  processingAt,
}: {
  parts: unknown[];
  partIndex: number;
  processingAt: string;
}) {
  return updateAssistantEmailPartOutput({
    parts,
    partIndex,
    outputPatch: {
      confirmationState: "processing",
      confirmationProcessingAt: processingAt,
    },
  });
}

function updateAssistantEmailPartWithPending({
  parts,
  partIndex,
}: {
  parts: unknown[];
  partIndex: number;
}) {
  return updateAssistantEmailPartOutput({
    parts,
    partIndex,
    outputPatch: {
      confirmationState: "pending",
    },
  });
}

async function reservePendingAssistantEmailAction({
  chatId,
  chatMessageId,
  toolCallId,
  actionType,
  emailAccountId,
  waitForPersistence,
  persistenceWaitMs,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  emailAccountId: string;
  waitForPersistence?: boolean;
  persistenceWaitMs?: number;
  logger: Logger;
}) {
  const matchEmailParts = (parts: unknown) =>
    !!findPendingAssistantEmailPart({ parts, toolCallId, actionType });
  const waitForPersistenceMs = waitForPersistence
    ? (persistenceWaitMs ?? PENDING_ACTION_PERSIST_WAIT_MS)
    : undefined;

  const chatMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: matchEmailParts,
    logPrefix: "Assistant email confirmation",
    waitForPersistenceMs,
  });

  if (!chatMessage) {
    warnAndThrowAssistantEmailConfirmationError({
      logger,
      logMessage: "Assistant email confirmation failed: chat message not found",
      safeMessage: "Chat message not found",
      chatMessageId,
      toolCallId,
      actionType,
    });
  }

  const lookup = findPendingAssistantEmailPart({
    parts: chatMessage.parts,
    toolCallId,
    actionType,
  });
  if (!lookup) {
    warnAndThrowAssistantEmailConfirmationError({
      logger,
      logMessage:
        "Assistant email confirmation failed: pending assistant action not found",
      safeMessage: "Pending assistant action not found",
      chatMessageId: chatMessage.id,
      toolCallId,
      actionType,
    });
  }

  if (
    lookup.output.confirmationState === "confirmed" &&
    lookup.output.confirmationResult
  ) {
    return {
      status: "confirmed" as const,
      confirmationResult: lookup.output.confirmationResult,
    };
  }

  if (
    lookup.output.confirmationState === "processing" &&
    !hasProcessingLeaseExpired(lookup.output.confirmationProcessingAt)
  ) {
    throw new SafeError(CONFIRMATION_IN_PROGRESS_ERROR);
  }

  const processingAt = new Date().toISOString();
  const processingParts = updateAssistantEmailPartWithProcessing({
    parts: lookup.parts,
    partIndex: lookup.index,
    processingAt,
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
      status: "reserved" as const,
      chatMessageId: chatMessage.id,
      output: lookup.output,
      parts: processingParts,
      partIndex: lookup.index,
    };
  }

  const latestMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: matchEmailParts,
    logPrefix: "Assistant email confirmation",
    waitForPersistenceMs,
  });

  if (!latestMessage) {
    warnAndThrowAssistantEmailConfirmationError({
      logger,
      logMessage:
        "Assistant email confirmation failed after reservation race: chat message not found",
      safeMessage: "Chat message not found",
      chatMessageId: chatMessage.id,
      toolCallId,
      actionType,
    });
  }

  const latestLookup = findPendingAssistantEmailPart({
    parts: latestMessage.parts,
    toolCallId,
    actionType,
  });

  if (
    latestLookup?.output.confirmationState === "confirmed" &&
    latestLookup.output.confirmationResult
  ) {
    return {
      status: "confirmed" as const,
      confirmationResult: latestLookup.output.confirmationResult,
    };
  }

  throw new SafeError(CONFIRMATION_IN_PROGRESS_ERROR);
}

async function clearPendingPartProcessing({
  chatMessageId,
  emailAccountId,
  findPart,
}: {
  chatMessageId?: string;
  emailAccountId: string;
  findPart: (parts: unknown) => {
    index: number;
    output: { confirmationState: string };
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
  if (!lookup || lookup.output.confirmationState !== "processing") return;

  const pendingParts = updateAssistantEmailPartWithPending({
    parts: lookup.parts,
    partIndex: lookup.index,
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
) {
  return ASSISTANT_EMAIL_ACTION_METADATA[actionType].errorMessage;
}

function getAssistantToolTypeForAction(
  actionType: AssistantPendingEmailActionType,
) {
  return ASSISTANT_EMAIL_ACTION_METADATA[actionType].toolType;
}

function parsePendingAssistantEmailOutput({
  actionType,
  output,
}: {
  actionType: AssistantPendingEmailActionType;
  output: unknown;
}) {
  return ASSISTANT_EMAIL_ACTION_METADATA[actionType].parseOutput(output);
}

function updateAssistantEmailPartOutput({
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

async function persistConfirmedAssistantEmailActionPart({
  chatMessageId,
  emailAccountId,
  toolCallId,
  actionType,
  confirmationResult,
  contentOverride,
  logger,
}: {
  chatMessageId: string;
  emailAccountId: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  confirmationResult: AssistantEmailConfirmationResult;
  contentOverride?: string;
  logger: Logger;
}) {
  await persistConfirmedAssistantPart({
    chatMessageId,
    emailAccountId,
    logger: logger.with({ chatMessageId, toolCallId, actionType }),
    findPart: (parts) =>
      findPendingAssistantEmailPart({ parts, toolCallId, actionType }),
    isConfirmed: (lookup) =>
      lookup.output.confirmationState === "confirmed" &&
      !!lookup.output.confirmationResult,
    buildParts: ({ parts, partIndex }) =>
      updateAssistantEmailPartWithConfirmation({
        parts,
        partIndex,
        confirmationResult,
        contentOverride,
      }),
  });
}

function hasProcessingLeaseExpired(processingAt?: string | null) {
  if (!processingAt) return false;

  const processingTime = Date.parse(processingAt);
  if (Number.isNaN(processingTime)) return false;

  return Date.now() - processingTime >= CONFIRMATION_PROCESSING_LEASE_MS;
}

async function reservePendingAssistantSaveMemory({
  chatId,
  chatMessageId,
  toolCallId,
  emailAccountId,
  waitForPersistence,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  emailAccountId: string;
  waitForPersistence?: boolean;
  logger: Logger;
}) {
  const matchSaveMemoryParts = (parts: unknown) =>
    !!findPendingAssistantSaveMemoryPart({ parts, toolCallId });
  const waitForPersistenceMs = waitForPersistence
    ? PENDING_ACTION_PERSIST_WAIT_MS
    : undefined;

  const chatMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: matchSaveMemoryParts,
    logPrefix: "Assistant save memory confirmation",
    waitForPersistenceMs,
  });

  if (!chatMessage) {
    logger.warn("Assistant save memory confirmation: chat message not found", {
      chatMessageId,
      toolCallId,
    });
    throw new SafeError("Chat message not found");
  }

  const lookup = findPendingAssistantSaveMemoryPart({
    parts: chatMessage.parts,
    toolCallId,
  });

  if (!lookup) {
    logger.warn("Assistant save memory confirmation: pending not found", {
      chatMessageId: chatMessage.id,
      toolCallId,
    });
    throw new SafeError("Pending memory save not found");
  }

  if (
    lookup.output.confirmationState === "confirmed" &&
    lookup.output.confirmationResult
  ) {
    return {
      status: "confirmed" as const,
      content: lookup.output.confirmationResult.content,
      confirmationResult: lookup.output.confirmationResult,
    };
  }

  if (
    lookup.output.confirmationState === "processing" &&
    !hasProcessingLeaseExpired(lookup.output.confirmationProcessingAt)
  ) {
    throw new SafeError(SAVE_MEMORY_CONFIRMATION_IN_PROGRESS_ERROR);
  }

  const processingAt = new Date().toISOString();
  const processingParts = updateAssistantEmailPartWithProcessing({
    parts: lookup.parts,
    partIndex: lookup.index,
    processingAt,
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
      status: "reserved" as const,
      chatMessageId: chatMessage.id,
      output: lookup.output,
      parts: processingParts,
      partIndex: lookup.index,
      toolInput: lookup.toolInput,
    };
  }

  const latestMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: matchSaveMemoryParts,
    logPrefix: "Assistant save memory confirmation",
    waitForPersistenceMs,
  });

  if (!latestMessage) {
    throw new SafeError("Chat message not found");
  }

  const latestLookup = findPendingAssistantSaveMemoryPart({
    parts: latestMessage.parts,
    toolCallId,
  });

  if (
    latestLookup?.output.confirmationState === "confirmed" &&
    latestLookup.output.confirmationResult
  ) {
    return {
      status: "confirmed" as const,
      content: latestLookup.output.confirmationResult.content,
      confirmationResult: latestLookup.output.confirmationResult,
    };
  }

  throw new SafeError(SAVE_MEMORY_CONFIRMATION_IN_PROGRESS_ERROR);
}

async function reservePendingAssistantCreateRule({
  chatId,
  chatMessageId,
  toolCallId,
  emailAccountId,
  waitForPersistence,
  logger,
}: {
  chatId: string;
  chatMessageId?: string;
  toolCallId: string;
  emailAccountId: string;
  waitForPersistence?: boolean;
  logger: Logger;
}) {
  const matchCreateRuleParts = (parts: unknown) =>
    !!findPendingAssistantCreateRulePart({ parts, toolCallId });
  const waitForPersistenceMs = waitForPersistence
    ? PENDING_ACTION_PERSIST_WAIT_MS
    : undefined;

  const chatMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: matchCreateRuleParts,
    logPrefix: "Assistant create rule confirmation",
    waitForPersistenceMs,
  });

  if (!chatMessage) {
    logger.warn("Assistant create rule confirmation: chat message not found", {
      chatMessageId,
      toolCallId,
    });
    throw new SafeError("Chat message not found");
  }

  const lookup = findPendingAssistantCreateRulePart({
    parts: chatMessage.parts,
    toolCallId,
  });

  if (!lookup) {
    logger.warn("Assistant create rule confirmation: pending not found", {
      chatMessageId: chatMessage.id,
      toolCallId,
    });
    throw new SafeError("Pending rule creation not found");
  }

  if (lookup.output.confirmationState === "confirmed" && lookup.output.ruleId) {
    return {
      status: "confirmed" as const,
      ruleId: lookup.output.ruleId,
    };
  }

  if (
    lookup.output.confirmationState === "processing" &&
    !hasProcessingLeaseExpired(lookup.output.confirmationProcessingAt)
  ) {
    throw new SafeError(CONFIRMATION_IN_PROGRESS_ERROR);
  }

  const processingAt = new Date().toISOString();
  const processingParts = updateAssistantEmailPartWithProcessing({
    parts: lookup.parts,
    partIndex: lookup.index,
    processingAt,
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
      status: "reserved" as const,
      chatMessageId: chatMessage.id,
      output: lookup.output,
      parts: processingParts,
      partIndex: lookup.index,
      toolInput: lookup.toolInput,
    };
  }

  const latestMessage = await findChatMessageForPendingAction({
    chatId,
    chatMessageId,
    emailAccountId,
    logger,
    matchParts: matchCreateRuleParts,
    logPrefix: "Assistant create rule confirmation",
    waitForPersistenceMs,
  });

  if (!latestMessage) {
    throw new SafeError("Chat message not found");
  }

  const latestLookup = findPendingAssistantCreateRulePart({
    parts: latestMessage.parts,
    toolCallId,
  });

  if (
    latestLookup?.output.confirmationState === "confirmed" &&
    latestLookup.output.ruleId
  ) {
    return {
      status: "confirmed" as const,
      ruleId: latestLookup.output.ruleId,
    };
  }

  throw new SafeError(CONFIRMATION_IN_PROGRESS_ERROR);
}

async function persistConfirmedAssistantCreateRulePart({
  chatMessageId,
  emailAccountId,
  toolCallId,
  riskMessages,
  ruleId,
  confirmedAt,
  logger,
}: {
  chatMessageId: string;
  emailAccountId: string;
  toolCallId: string;
  riskMessages?: string[];
  ruleId: string;
  confirmedAt: string;
  logger: Logger;
}) {
  await persistConfirmedAssistantPart({
    chatMessageId,
    emailAccountId,
    logger: logger.with({ chatMessageId, toolCallId, ruleId }),
    findPart: (parts) =>
      findPendingAssistantCreateRulePart({
        parts,
        toolCallId,
      }),
    isConfirmed: (lookup) =>
      lookup.output.confirmationState === "confirmed" &&
      lookup.output.ruleId === ruleId,
    buildParts: ({ parts, partIndex }) =>
      buildConfirmedAssistantCreateRuleParts({
        parts,
        partIndex,
        riskMessages,
        ruleId,
        confirmedAt,
      }),
  });
}

async function persistConfirmedAssistantSaveMemoryPart({
  chatMessageId,
  emailAccountId,
  toolCallId,
  content,
  confirmedAt,
  deduplicated,
  logger,
}: {
  chatMessageId: string;
  emailAccountId: string;
  toolCallId: string;
  content: string;
  confirmedAt: string;
  deduplicated: boolean;
  logger: Logger;
}) {
  await persistConfirmedAssistantPart({
    chatMessageId,
    emailAccountId,
    logger: logger.with({ chatMessageId, toolCallId, content }),
    findPart: (parts) =>
      findPendingAssistantSaveMemoryPart({
        parts,
        toolCallId,
      }),
    isConfirmed: (lookup) =>
      lookup.output.confirmationState === "confirmed" &&
      lookup.output.confirmationResult?.content === content,
    buildParts: ({ parts, partIndex }) =>
      buildConfirmedAssistantSaveMemoryParts({
        parts,
        partIndex,
        content,
        confirmedAt,
        deduplicated,
      }),
  });
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
        return;
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
        return;
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

function buildConfirmedAssistantSaveMemoryParts({
  parts,
  partIndex,
  content,
  confirmedAt,
  deduplicated,
}: {
  parts: unknown[];
  partIndex: number;
  content: string;
  confirmedAt: string;
  deduplicated: boolean;
}) {
  return updateAssistantEmailPartOutput({
    parts,
    partIndex,
    outputPatch: {
      success: true,
      saved: true,
      actionType: "save_memory",
      requiresConfirmation: true,
      confirmationState: "confirmed",
      content,
      confirmationResult: {
        content,
        confirmedAt,
        ...(deduplicated ? { deduplicated: true } : {}),
      },
    },
  });
}

function buildConfirmedAssistantCreateRuleParts({
  parts,
  partIndex,
  riskMessages,
  ruleId,
  confirmedAt,
}: {
  parts: unknown[];
  partIndex: number;
  riskMessages?: string[];
  ruleId: string;
  confirmedAt: string;
}) {
  return updateAssistantEmailPartOutput({
    parts,
    partIndex,
    outputPatch: {
      success: true,
      actionType: "create_rule",
      requiresConfirmation: true,
      confirmationState: "confirmed",
      riskMessages,
      ruleId,
      confirmationResult: { ruleId, confirmedAt },
    },
  });
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

function warnAndThrowAssistantEmailConfirmationError({
  logger,
  logMessage,
  safeMessage,
  chatMessageId,
  toolCallId,
  actionType,
}: {
  logger: Logger;
  logMessage: string;
  safeMessage: string;
  chatMessageId?: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
}): never {
  logger.warn(logMessage, {
    chatMessageId,
    toolCallId,
    actionType,
  });

  throw new SafeError(safeMessage);
}

function parsePendingSendEmailOutput(output: unknown) {
  const parsed = pendingSendEmailToolOutputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

function parsePendingReplyEmailOutput(output: unknown) {
  const parsed = pendingReplyEmailToolOutputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

function parsePendingForwardEmailOutput(output: unknown) {
  const parsed = pendingForwardEmailToolOutputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
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
