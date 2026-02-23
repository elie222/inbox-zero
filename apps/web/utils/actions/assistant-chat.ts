"use server";

import type { Prisma } from "@/generated/prisma/client";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import prisma from "@/utils/prisma";
import {
  assistantPendingEmailToolOutputSchema,
  type AssistantEmailConfirmationResult,
  type AssistantPendingEmailActionType,
  type AssistantPendingEmailToolOutput,
  confirmAssistantEmailActionBody,
} from "./assistant-chat.validation";

const TOOL_TYPE_BY_ACTION: Record<AssistantPendingEmailActionType, string> = {
  send_email: "tool-sendEmail",
  reply_email: "tool-replyEmail",
  forward_email: "tool-forwardEmail",
};

export const confirmAssistantEmailAction = actionClient
  .metadata({ name: "confirmAssistantEmail" })
  .inputSchema(confirmAssistantEmailActionBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { chatMessageId, toolCallId, actionType },
    }) => {
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
          success: true,
          confirmationState: "confirmed" as const,
          actionType,
          confirmationResult: lookup.output.confirmationResult,
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
          output: lookup.output,
          emailProvider,
          emailAccountId,
        });
      } catch (error) {
        logger.error("Failed to confirm assistant email action", {
          error,
          actionType,
        });
        throw new SafeError(getAssistantEmailActionErrorMessage(actionType));
      }

      const updatedParts = updateAssistantEmailPartWithConfirmation({
        parts: lookup.parts,
        partIndex: lookup.index,
        confirmationResult,
      });

      await prisma.chatMessage.update({
        where: { id: chatMessage.id },
        data: { parts: updatedParts as Prisma.InputJsonValue },
      });

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

  if (output.actionType === "send_email") {
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

  if (output.actionType === "reply_email") {
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

  const expectedToolType = TOOL_TYPE_BY_ACTION[actionType];
  for (const [index, part] of parts.entries()) {
    if (
      !isRecord(part) ||
      part.type !== expectedToolType ||
      part.toolCallId !== toolCallId
    ) {
      continue;
    }

    const parsedOutput = assistantPendingEmailToolOutputSchema.safeParse(
      part.output,
    );
    if (!parsedOutput.success) return null;
    if (parsedOutput.data.actionType !== actionType) return null;

    return {
      index,
      output: parsedOutput.data,
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
    return {
      ...part,
      output: {
        ...existingOutput,
        success: true,
        confirmationState: "confirmed",
        confirmationResult,
      },
    };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
