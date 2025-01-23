import type { gmail_v1 } from "@googleapis/gmail";
import type { MessageWithPayload, ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import { processUserRequest } from "@/utils/ai/assistant/fix-rules";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { emailToContent, parseMessage } from "@/utils/mail";
import { replyToEmail } from "@/utils/gmail/mail";
import { getThread } from "@/utils/gmail/thread";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";

const logger = createScopedLogger("process-assistant-email");

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

  // 1. get thread
  // 2. get first message in thread to the personal assistant
  // 3. get the referenced message from that message

  const thread = await getThread(message.threadId, gmail);
  const threadMessages = thread?.messages?.map((m) =>
    parseMessage(m as MessageWithPayload),
  );

  if (!threadMessages?.length) {
    logger.error("No thread messages found", { messageId: message.id });
    await replyToEmail(
      gmail,
      message,
      "Something went wrong. I couldn't read any messages.",
    );
    return;
  }

  const firstMessageToAssistant = threadMessages.find((m) =>
    isAssistantEmail({
      userEmail,
      emailToCheck: m.headers.to,
    }),
  );

  if (!firstMessageToAssistant) {
    logger.error("No first message to assistant found", {
      messageId: message.id,
    });
    await replyToEmail(
      gmail,
      message,
      "Something went wrong. I couldn't find the first message to the personal assistant.",
    );
    return;
  }

  const originalMessageId = firstMessageToAssistant.headers["in-reply-to"];
  if (!originalMessageId) {
    logger.error("No original message ID found", { messageId: message.id });
    await replyToEmail(
      gmail,
      message,
      "I only work with forwarded emails for now.",
    );
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

  const parsedOriginalMessage = parseMessage(originalMessage);

  const [user, executedRule, senderCategory] = await Promise.all([
    prisma.user.findUnique({
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
            group: {
              select: {
                id: true,
                name: true,
                items: {
                  select: {
                    id: true,
                    type: true,
                    value: true,
                  },
                },
              },
            },
          },
        },
        categories: true,
      },
    }),
    prisma.executedRule.findUnique({
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
    }),
    prisma.newsletter.findUnique({
      where: {
        email_userId: {
          userId,
          email: parsedOriginalMessage.headers.from,
        },
      },
      select: {
        category: { select: { name: true } },
      },
    }),
  ]);

  if (!user) {
    logger.error("User not found", { userEmail });
    return;
  }

  const firstMessageToAssistantDate = new Date(
    firstMessageToAssistant.headers.date,
  );

  const additionalMessages = threadMessages
    .filter((m) => new Date(m.headers.date) > firstMessageToAssistantDate)
    .map((m) => ({
      role: isAssistantEmail({
        userEmail,
        emailToCheck: m.headers.from,
      })
        ? ("assistant" as const)
        : ("user" as const),
      content: emailToContent(m),
    }));

  const result = await processUserRequest({
    user,
    rules: user.rules,
    originalEmail: parsedOriginalMessage,
    userRequestEmail: message,
    additionalMessages,
    matchedRule: executedRule?.rule || null,
    categories: user.categories.length ? user.categories : null,
    senderCategory: senderCategory?.category?.name ?? null,
  });

  const toolCalls = result.steps.flatMap((step) => step.toolCalls);
  const lastToolCall = toolCalls[toolCalls.length - 1];

  if (lastToolCall?.toolName === "reply") {
    await replyToEmail(
      gmail,
      message,
      lastToolCall.args.content,
      replaceName(message.headers.to, "Assistant"),
    );
  }
}

function verifyUserSentEmail(message: ParsedMessage, userEmail: string) {
  return (
    extractEmailAddress(message.headers.from).toLowerCase() ===
    userEmail.toLowerCase()
  );
}

function replaceName(email: string, name: string) {
  const emailAddress = extractEmailAddress(email);
  return `${name} <${emailAddress}>`;
}
