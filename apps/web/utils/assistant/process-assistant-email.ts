import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { getOriginalMessageId } from "@/utils/assistant/get-original-message-id";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import { processUserRequest } from "@/utils/ai/assistant/process-user-request";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { parseMessage } from "@/utils/mail";
import { replyToEmail } from "@/utils/gmail/mail";

const logger = createScopedLogger("AssistantEmail");

// TODO: load full email thread history

export async function processAssistantEmail({
  userEmail,
  userId,
  message,
  gmail,
}: {
  userEmail: string;
  userId: string;
  message: ParsedMessage;
  gmail: gmail_v1.Gmail;
}) {
  if (!verifyUserSentEmail(message, userEmail)) {
    logger.error("Unauthorized assistant access attempt", {
      userEmail: userEmail,
      from: message.headers.from,
      to: message.headers.to,
    });
    throw new Error("Unauthorized assistant access attempt");
  }

  logger.info("Processing assistant email", { messageId: message.id });

  const originalMessageId = getOriginalMessageId({
    references: message.headers.references,
    inReplyTo: message.headers["reply-to"],
  });
  if (!originalMessageId) {
    logger.error("No original message ID found", { messageId: message.id });
    return;
  }

  const originalMessage = await getMessageByRfc822Id(originalMessageId, gmail);
  if (!originalMessage) {
    logger.error("No original message found", { messageId: message.id });
    await replyToEmail(
      gmail,
      message,
      "I only work with forwarded emails for now.",
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      rules: {
        include: {
          actions: true,
          categoryFilters: true,
          group: true,
        },
      },
    },
  });

  if (!user) {
    logger.error("User not found", { userEmail });
    return;
  }

  const executedRule = await prisma.executedRule.findUnique({
    where: {
      unique_user_thread_message: {
        userId,
        threadId: originalMessage.threadId ?? "",
        messageId: originalMessageId,
      },
    },
    select: {
      rule: {
        include: {
          actions: true,
          categoryFilters: true,
          group: true,
        },
      },
    },
  });

  const parsedOriginalMessage = parseMessage(originalMessage);

  await processUserRequest({
    user,
    rules: user.rules,
    userRequestEmail: message,
    originalEmail: parsedOriginalMessage,
    actualRule: executedRule?.rule || null,
    gmail,
  });
}

function verifyUserSentEmail(message: ParsedMessage, userEmail: string) {
  return (
    extractEmailAddress(message.headers.from).toLowerCase() ===
    userEmail.toLowerCase()
  );
}
