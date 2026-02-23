"use server";

import type { Prisma } from "@/generated/prisma/client";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import prisma from "@/utils/prisma";
import {
  type AssistantEmailConfirmationResult,
  type AssistantPendingEmailActionType,
  type AssistantPendingEmailToolOutput,
  pendingForwardEmailToolOutputSchema,
  pendingReplyEmailToolOutputSchema,
  pendingSendEmailToolOutputSchema,
  type PendingForwardEmailToolOutput,
  type PendingReplyEmailToolOutput,
  type PendingSendEmailToolOutput,
  confirmAssistantEmailActionBody,
} from "./assistant-chat.validation";

const CONFIRMATION_IN_PROGRESS_ERROR =
  "Email action confirmation already in progress";

export const confirmAssistantEmailAction = actionClient
  .metadata({ name: "confirmAssistantEmail" })
  .inputSchema(confirmAssistantEmailActionBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { chatMessageId, toolCallId, actionType },
    }) => {
      const reservation = await reservePendingAssistantEmailAction({
        chatMessageId,
        toolCallId,
        actionType,
        emailAccountId,
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
      });

      try {
        await prisma.chatMessage.update({
          where: { id: reservation.chatMessageId },
          data: { parts: updatedParts as Prisma.InputJsonValue },
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
    },
  );

async function executeAssistantEmailAction({
  output,
  emailProvider,
  emailAccountId,
}: {
  output: AssistantPendingEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  emailAccountId: string;
}): Promise<AssistantEmailConfirmationResult> {
  const confirmedAt = new Date().toISOString();

  switch (output.actionType) {
    case "send_email":
      return confirmPendingSendEmailAction({
        output,
        emailProvider,
        emailAccountId,
        confirmedAt,
      });
    case "reply_email":
      return confirmPendingReplyEmailAction({
        output,
        emailProvider,
        confirmedAt,
      });
    case "forward_email":
      return confirmPendingForwardEmailAction({
        output,
        emailProvider,
        confirmedAt,
      });
  }
}

async function confirmPendingSendEmailAction({
  output,
  emailProvider,
  emailAccountId,
  confirmedAt,
}: {
  output: PendingSendEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  emailAccountId: string;
  confirmedAt: string;
}) {
  const from =
    output.pendingAction.from ||
    (await getFormattedSenderAddress({ emailAccountId }));

  const result = await emailProvider.sendEmailWithHtml({
    to: output.pendingAction.to,
    cc: output.pendingAction.cc || undefined,
    bcc: output.pendingAction.bcc || undefined,
    subject: output.pendingAction.subject,
    messageHtml: output.pendingAction.messageHtml,
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
}: {
  output: PendingReplyEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  confirmedAt: string;
}) {
  const message = await emailProvider.getMessage(
    output.pendingAction.messageId,
  );
  await emailProvider.replyToEmail(message, output.pendingAction.content);

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
}: {
  output: PendingForwardEmailToolOutput;
  emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  confirmedAt: string;
}) {
  const message = await emailProvider.getMessage(
    output.pendingAction.messageId,
  );
  await emailProvider.forwardEmail(message, {
    to: output.pendingAction.to,
    cc: output.pendingAction.cc || undefined,
    bcc: output.pendingAction.bcc || undefined,
    content: output.pendingAction.content || undefined,
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
}: {
  parts: unknown[];
  partIndex: number;
  confirmationResult: AssistantEmailConfirmationResult;
}) {
  return parts.map((part, index) => {
    if (index !== partIndex || !isRecord(part)) return part;

    const existingOutput = isRecord(part.output) ? part.output : {};
    const outputWithoutProcessing =
      getOutputWithoutProcessingMetadata(existingOutput);
    return {
      ...part,
      output: {
        ...outputWithoutProcessing,
        success: true,
        confirmationState: "confirmed",
        confirmationResult,
      },
    };
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
  return parts.map((part, index) => {
    if (index !== partIndex || !isRecord(part)) return part;

    const existingOutput = isRecord(part.output) ? part.output : {};
    const outputWithoutProcessing =
      getOutputWithoutProcessingMetadata(existingOutput);
    return {
      ...part,
      output: {
        ...outputWithoutProcessing,
        confirmationState: "processing",
        confirmationProcessingAt: processingAt,
      },
    };
  });
}

function updateAssistantEmailPartWithPending({
  parts,
  partIndex,
}: {
  parts: unknown[];
  partIndex: number;
}) {
  return parts.map((part, index) => {
    if (index !== partIndex || !isRecord(part)) return part;

    const existingOutput = isRecord(part.output) ? part.output : {};
    const outputWithoutProcessing =
      getOutputWithoutProcessingMetadata(existingOutput);
    return {
      ...part,
      output: {
        ...outputWithoutProcessing,
        confirmationState: "pending",
      },
    };
  });
}

async function reservePendingAssistantEmailAction({
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
      chatId: true,
      updatedAt: true,
      parts: true,
    },
  });

  if (!chatMessage) throw new SafeError("Chat message not found");

  const lookup = findPendingAssistantEmailPart({
    parts: chatMessage.parts,
    toolCallId,
    actionType,
  });
  if (!lookup) throw new SafeError("Pending assistant action not found");

  if (
    lookup.output.confirmationState === "confirmed" &&
    lookup.output.confirmationResult
  ) {
    return {
      status: "confirmed" as const,
      confirmationResult: lookup.output.confirmationResult,
    };
  }

  if (lookup.output.confirmationState === "processing") {
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

  const latestMessage = await prisma.chatMessage.findFirst({
    where: {
      id: chatMessageId,
      chat: { emailAccountId },
    },
    select: {
      parts: true,
    },
  });

  if (!latestMessage) throw new SafeError("Chat message not found");

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
  if (actionType === "send_email") return "Failed to send email";
  if (actionType === "reply_email") return "Failed to send reply";
  return "Failed to forward email";
}

function getAssistantToolTypeForAction(
  actionType: AssistantPendingEmailActionType,
) {
  if (actionType === "send_email") return "tool-sendEmail";
  if (actionType === "reply_email") return "tool-replyEmail";
  return "tool-forwardEmail";
}

function parsePendingAssistantEmailOutput({
  actionType,
  output,
}: {
  actionType: AssistantPendingEmailActionType;
  output: unknown;
}) {
  if (actionType === "send_email") {
    const parsed = pendingSendEmailToolOutputSchema.safeParse(output);
    return parsed.success ? parsed.data : null;
  }

  if (actionType === "reply_email") {
    const parsed = pendingReplyEmailToolOutputSchema.safeParse(output);
    return parsed.success ? parsed.data : null;
  }

  const parsed = pendingForwardEmailToolOutputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

function getOutputWithoutProcessingMetadata(output: Record<string, unknown>) {
  const { confirmationProcessingAt: _, ...rest } = output;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
