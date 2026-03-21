"use server";

import type { Prisma } from "@/generated/prisma/client";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { convertNewlinesToBr, escapeHtml } from "@/utils/string";
import {
  type AssistantEmailConfirmationResult,
  type AssistantPendingEmailActionType,
  type AssistantPendingEmailToolOutput,
  confirmAssistantCreateRuleBody,
  confirmAssistantEmailActionBody,
  pendingCreateRuleToolOutputSchema,
  pendingForwardEmailToolOutputSchema,
  pendingReplyEmailToolOutputSchema,
  pendingSendEmailToolOutputSchema,
  type PendingForwardEmailToolOutput,
  type PendingReplyEmailToolOutput,
  type PendingSendEmailToolOutput,
} from "./assistant-chat.validation";
import {
  buildCreateRuleSchemaFromChatToolInput,
  type ChatCreateRuleToolInvocation,
} from "@/utils/ai/assistant/chat-rule-tools";
import { createRule } from "@/utils/rule/rule";

const CONFIRMATION_IN_PROGRESS_ERROR =
  "Email action confirmation already in progress";
const CONFIRMATION_PROCESSING_LEASE_MS = 5 * 60 * 1000;
const CONFIRMATION_PERSIST_MAX_ATTEMPTS = 3;

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

export const confirmAssistantEmailAction = actionClient
  .metadata({ name: "confirmAssistantEmail" })
  .inputSchema(confirmAssistantEmailActionBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: {
        chatId,
        chatMessageId,
        toolCallId,
        actionType,
        contentOverride,
      },
    }) =>
      confirmAssistantEmailActionForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        actionType,
        contentOverride,
        emailAccountId,
        provider,
        logger,
      }),
  );

export const confirmAssistantCreateRule = actionClient
  .metadata({ name: "confirmAssistantCreateRule" })
  .inputSchema(confirmAssistantCreateRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { chatId, chatMessageId, toolCallId },
    }) =>
      confirmAssistantCreateRuleForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        emailAccountId,
        provider,
        logger,
      }),
  );

export async function confirmAssistantEmailActionForAccount({
  chatId,
  chatMessageId,
  toolCallId,
  actionType,
  contentOverride,
  emailAccountId,
  provider,
  logger,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  contentOverride?: string;
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
    await clearAssistantEmailPartProcessing({
      chatMessageId: reservation.chatMessageId,
      toolCallId,
      actionType,
      emailAccountId,
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

  const updatedParts = updateAssistantEmailPartWithConfirmation({
    parts: reservation.parts,
    partIndex: reservation.partIndex,
    confirmationResult,
    contentOverride,
  });

  try {
    await persistConfirmedAssistantEmailPart({
      chatMessageId: reservation.chatMessageId,
      parts: updatedParts,
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
  emailAccountId,
  provider,
  logger,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const reservation = await reservePendingAssistantCreateRule({
    chatId,
    chatMessageId,
    toolCallId,
    emailAccountId,
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
    await clearAssistantCreateRulePartProcessing({
      chatMessageId: reservation.chatMessageId,
      toolCallId,
      emailAccountId,
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
  const riskMessages = reservation.output.riskMessages;
  const updatedParts = updateAssistantCreateRulePartWithConfirmation({
    parts: reservation.parts,
    partIndex: reservation.partIndex,
    ruleId: rule.id,
    riskMessages,
    confirmedAt,
  });

  try {
    await persistConfirmedAssistantEmailPart({
      chatMessageId: reservation.chatMessageId,
      parts: updatedParts,
    });
  } catch (error) {
    logger.error("Failed to persist confirmed create rule", { error });
    throw new SafeError(
      "Rule was created but confirmation state could not be saved. Please refresh.",
    );
  }

  return {
    success: true,
    confirmationState: "confirmed" as const,
    ruleId: rule.id,
    confirmationResult: { ruleId: rule.id, confirmedAt },
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
        confirmedAt,
        contentOverride,
      });
    case "forward_email":
      return confirmPendingForwardEmailAction({
        output,
        emailProvider,
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

  const result = await emailProvider.sendEmailWithHtml({
    to: output.pendingAction.to,
    cc: output.pendingAction.cc || undefined,
    bcc: output.pendingAction.bcc || undefined,
    subject: output.pendingAction.subject,
    messageHtml,
    ...(from ? { from } : {}),
  });

  return {
    actionType: output.actionType,
    messageId: result.messageId || null,
    threadId: result.threadId || null,
    to: output.pendingAction.to,
    subject: output.pendingAction.subject,
    confirmedAt,
  };
}

async function confirmPendingReplyEmailAction({
  output,
  emailProvider,
  confirmedAt,
  contentOverride,
}: {
  output: PendingReplyEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  confirmedAt: string;
  contentOverride?: string;
}) {
  const message = await emailProvider.getMessage(
    output.pendingAction.messageId,
  );
  await emailProvider.replyToEmail(
    message,
    contentOverride || output.pendingAction.content,
  );

  const latestMessage = await getLatestMessageInThreadSafe(
    emailProvider,
    message.threadId,
  );

  return {
    actionType: output.actionType,
    messageId: latestMessage?.id || message.id || null,
    threadId: message.threadId || null,
    to: message.headers["reply-to"] || message.headers.from || null,
    subject: message.subject || message.headers.subject || null,
    confirmedAt,
  };
}

async function confirmPendingForwardEmailAction({
  output,
  emailProvider,
  confirmedAt,
  contentOverride,
}: {
  output: PendingForwardEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  confirmedAt: string;
  contentOverride?: string;
}) {
  const message = await emailProvider.getMessage(
    output.pendingAction.messageId,
  );
  await emailProvider.forwardEmail(message, {
    to: output.pendingAction.to,
    cc: output.pendingAction.cc || undefined,
    bcc: output.pendingAction.bcc || undefined,
    content: contentOverride || output.pendingAction.content || undefined,
  });

  const latestMessage = await getLatestMessageInThreadSafe(
    emailProvider,
    message.threadId,
  );

  return {
    actionType: output.actionType,
    messageId: latestMessage?.id || null,
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

async function findChatMessageForPendingCreateRule({
  chatId,
  chatMessageId,
  toolCallId,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const chatMessage = await prisma.chatMessage.findFirst({
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
  });

  if (chatMessage) return chatMessage;

  const fallbackCandidates = await prisma.chatMessage.findMany({
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

  for (const candidate of fallbackCandidates) {
    const lookup = findPendingAssistantCreateRulePart({
      parts: candidate.parts,
      toolCallId,
    });
    if (!lookup) continue;

    logger.warn(
      "Assistant create rule confirmation recovered using fallback message lookup",
      {
        chatId,
        chatMessageId,
        resolvedChatMessageId: candidate.id,
        toolCallId,
      },
    );
    return candidate;
  }

  return null;
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
  logger,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  emailAccountId: string;
  logger: Logger;
}) {
  const chatMessage = await findChatMessageForPendingAssistantEmailAction({
    chatId,
    chatMessageId,
    toolCallId,
    actionType,
    emailAccountId,
    logger,
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

  const latestMessage = await findChatMessageForPendingAssistantEmailAction({
    chatId,
    chatMessageId,
    toolCallId,
    actionType,
    emailAccountId,
    logger,
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

async function clearAssistantEmailPartProcessing({
  chatMessageId,
  toolCallId,
  actionType,
  emailAccountId,
}: {
  chatMessageId: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  emailAccountId: string;
}) {
  const chatMessage = await prisma.chatMessage.findFirst({
    where: {
      id: chatMessageId,
      chat: { emailAccountId },
    },
    select: {
      id: true,
      parts: true,
    },
  });

  if (!chatMessage) return;

  const lookup = findPendingAssistantEmailPart({
    parts: chatMessage.parts,
    toolCallId,
    actionType,
  });
  if (!lookup || lookup.output.confirmationState !== "processing") return;

  const pendingParts = updateAssistantEmailPartWithPending({
    parts: lookup.parts,
    partIndex: lookup.index,
  });
  await prisma.chatMessage.update({
    where: { id: chatMessage.id },
    data: { parts: pendingParts as Prisma.InputJsonValue },
  });
}

async function getLatestMessageInThreadSafe(
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>,
  threadId: string,
) {
  try {
    return await emailProvider.getLatestMessageInThread(threadId);
  } catch {
    return null;
  }
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

function updateAssistantCreateRulePartWithProcessing({
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

function updateAssistantCreateRulePartWithPending({
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

function updateAssistantCreateRulePartWithConfirmation({
  parts,
  partIndex,
  ruleId,
  riskMessages,
  confirmedAt,
}: {
  parts: unknown[];
  partIndex: number;
  ruleId: string;
  riskMessages: string[];
  confirmedAt: string;
}) {
  return parts.map((part, index) => {
    if (index !== partIndex || !isRecord(part)) return part;
    const existingOutput = isRecord(part.output) ? part.output : {};
    const rest = getOutputWithoutProcessingMetadata(existingOutput);
    return {
      ...part,
      output: {
        ...rest,
        success: true,
        actionType: "create_rule",
        requiresConfirmation: true,
        confirmationState: "confirmed",
        riskMessages,
        ruleId,
        confirmationResult: { ruleId, confirmedAt },
      },
    };
  });
}

async function persistConfirmedAssistantEmailPart({
  chatMessageId,
  parts,
}: {
  chatMessageId: string;
  parts: unknown[];
}) {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= CONFIRMATION_PERSIST_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      await prisma.chatMessage.update({
        where: { id: chatMessageId },
        data: { parts: parts as Prisma.InputJsonValue },
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function hasProcessingLeaseExpired(processingAt?: string | null) {
  if (!processingAt) return false;

  const processingTime = Date.parse(processingAt);
  if (Number.isNaN(processingTime)) return false;

  return Date.now() - processingTime >= CONFIRMATION_PROCESSING_LEASE_MS;
}

async function clearAssistantCreateRulePartProcessing({
  chatMessageId,
  toolCallId,
  emailAccountId,
}: {
  chatMessageId: string;
  toolCallId: string;
  emailAccountId: string;
}) {
  const chatMessage = await prisma.chatMessage.findFirst({
    where: {
      id: chatMessageId,
      chat: { emailAccountId },
    },
    select: {
      id: true,
      parts: true,
    },
  });

  if (!chatMessage) return;

  const lookup = findPendingAssistantCreateRulePart({
    parts: chatMessage.parts,
    toolCallId,
  });
  if (!lookup || lookup.output.confirmationState !== "processing") return;

  const pendingParts = updateAssistantCreateRulePartWithPending({
    parts: lookup.parts,
    partIndex: lookup.index,
  });
  await prisma.chatMessage.update({
    where: { id: chatMessage.id },
    data: { parts: pendingParts as Prisma.InputJsonValue },
  });
}

async function reservePendingAssistantCreateRule({
  chatId,
  chatMessageId,
  toolCallId,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const chatMessage = await findChatMessageForPendingCreateRule({
    chatId,
    chatMessageId,
    toolCallId,
    emailAccountId,
    logger,
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
  const processingParts = updateAssistantCreateRulePartWithProcessing({
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

  const latestMessage = await findChatMessageForPendingCreateRule({
    chatId,
    chatMessageId,
    toolCallId,
    emailAccountId,
    logger,
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
  chatMessageId: string;
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

async function findChatMessageForPendingAssistantEmailAction({
  chatId,
  chatMessageId,
  toolCallId,
  actionType,
  emailAccountId,
  logger,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
  actionType: AssistantPendingEmailActionType;
  emailAccountId: string;
  logger: Logger;
}) {
  const chatMessage = await prisma.chatMessage.findFirst({
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
  });

  if (chatMessage) return chatMessage;

  const fallbackCandidates = await prisma.chatMessage.findMany({
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

  for (const candidate of fallbackCandidates) {
    const lookup = findPendingAssistantEmailPart({
      parts: candidate.parts,
      toolCallId,
      actionType,
    });
    if (!lookup) continue;

    logger.warn(
      "Assistant email confirmation recovered using fallback message lookup",
      {
        chatId,
        chatMessageId,
        resolvedChatMessageId: candidate.id,
        toolCallId,
        actionType,
      },
    );
    return candidate;
  }

  return null;
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
