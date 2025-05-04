import type { gmail_v1 } from "@googleapis/gmail";
import { isDefined, type ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import { processUserRequest } from "@/utils/ai/assistant/process-user-request";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { emailToContent, parseMessage } from "@/utils/mail";
import { replyToEmail } from "@/utils/gmail/mail";
import { getThreadMessages } from "@/utils/gmail/thread";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { getOrCreateInboxZeroLabel, labelMessage } from "@/utils/gmail/label";
import { internalDateToDate } from "@/utils/date";

const logger = createScopedLogger("process-assistant-email");

type ProcessAssistantEmailArgs = {
  emailAccountId: string;
  userEmail: string;
  message: ParsedMessage;
  gmail: gmail_v1.Gmail;
};

export async function processAssistantEmail({
  emailAccountId,
  userEmail,
  message,
  gmail,
}: ProcessAssistantEmailArgs) {
  return withProcessingLabels(message.id, gmail, () =>
    processAssistantEmailInternal({
      emailAccountId,
      userEmail,
      message,
      gmail,
    }),
  );
}

async function processAssistantEmailInternal({
  emailAccountId,
  userEmail,
  message,
  gmail,
}: ProcessAssistantEmailArgs) {
  if (!verifyUserSentEmail({ message, userEmail })) {
    logger.error("Unauthorized assistant access attempt", {
      email: userEmail,
      from: message.headers.from,
      to: message.headers.to,
    });
    throw new Error("Unauthorized assistant access attempt");
  }

  const loggerOptions = {
    emailAccountId,
    threadId: message.threadId,
    messageId: message.id,
  };

  logger.info("Processing assistant email", loggerOptions);

  // 1. get thread
  // 2. get first message in thread to the personal assistant
  // 3. get the referenced message from that message

  const threadMessages = await getThreadMessages(message.threadId, gmail);

  if (!threadMessages?.length) {
    logger.error("No thread messages found", loggerOptions);
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
  const originalMessage = await getOriginalMessage(originalMessageId, gmail);

  const [emailAccount, executedRule, senderCategory] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        userId: true,
        email: true,
        about: true,
        user: {
          select: {
            aiProvider: true,
            aiModel: true,
            aiApiKey: true,
          },
        },
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
    originalMessage
      ? prisma.executedRule.findUnique({
          where: {
            unique_emailAccount_thread_message: {
              emailAccountId,
              threadId: originalMessage.threadId,
              messageId: originalMessage.id,
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
        })
      : null,
    originalMessage
      ? prisma.newsletter.findUnique({
          where: {
            email_emailAccountId: {
              email: extractEmailAddress(originalMessage.headers.from),
              emailAccountId,
            },
          },
          select: {
            category: { select: { name: true } },
          },
        })
      : null,
  ]);

  if (!emailAccount) {
    logger.error("User not found", loggerOptions);
    return;
  }

  const firstMessageToAssistantDate = internalDateToDate(
    firstMessageToAssistant.internalDate,
  );

  const messages = threadMessages
    .filter(
      (m) => internalDateToDate(m.internalDate) >= firstMessageToAssistantDate,
    )
    .map((m) => {
      const isAssistant = isAssistantEmail({
        userEmail,
        emailToCheck: m.headers.from,
      });
      const isFirstMessageToAssistant = m.id === firstMessageToAssistant.id;

      let content = "";

      // use subject if first message
      if (isFirstMessageToAssistant && !originalMessage) {
        content += `Subject: ${m.headers.subject}\n\n`;
      }

      content += emailToContent(m, {
        extractReply: true,
        removeForwarded: isFirstMessageToAssistant,
      });

      return {
        role: isAssistant ? "assistant" : "user",
        content,
      } as const;
    });

  if (messages[messages.length - 1].role === "assistant") {
    logger.error("Assistant message cannot be last", loggerOptions);
    return;
  }

  const result = await processUserRequest({
    emailAccount,
    rules: emailAccount.rules,
    originalEmail: originalMessage,
    messages,
    matchedRule: executedRule?.rule || null,
    categories: emailAccount.categories.length ? emailAccount.categories : null,
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

function verifyUserSentEmail({
  message,
  userEmail,
}: {
  message: ParsedMessage;
  userEmail: string;
}) {
  return (
    extractEmailAddress(message.headers.from).toLowerCase() ===
    userEmail.toLowerCase()
  );
}

function replaceName(email: string, name: string) {
  const emailAddress = extractEmailAddress(email);
  return `${name} <${emailAddress}>`;
}

async function getOriginalMessage(
  originalMessageId: string | undefined,
  gmail: gmail_v1.Gmail,
) {
  if (!originalMessageId) return null;
  const originalMessage = await getMessageByRfc822Id(originalMessageId, gmail);
  if (!originalMessage) return null;
  return parseMessage(originalMessage);
}

// Label the message with processing and assistant labels, and remove the processing label when done
async function withProcessingLabels<T>(
  messageId: string,
  gmail: gmail_v1.Gmail,
  fn: () => Promise<T>,
): Promise<T> {
  // Get labels first so we can reuse them
  const results = await Promise.allSettled([
    getOrCreateInboxZeroLabel({
      gmail,
      key: "processing",
    }),
    getOrCreateInboxZeroLabel({
      gmail,
      key: "assistant",
    }),
  ]);

  const [processingLabelResult, assistantLabelResult] = results;

  if (processingLabelResult.status === "rejected") {
    logger.error("Error getting processing label", {
      error: processingLabelResult.reason,
    });
  }

  if (assistantLabelResult.status === "rejected") {
    logger.error("Error getting assistant label", {
      error: assistantLabelResult.reason,
    });
  }

  const labels = results
    .map((result) =>
      result.status === "fulfilled" ? result.value?.id : undefined,
    )
    .filter(isDefined);

  if (labels.length) {
    // Fire and forget the initial labeling
    labelMessage({
      gmail,
      messageId,
      addLabelIds: labels,
    }).catch((error) => {
      logger.error("Error labeling message", { error });
    });
  }

  try {
    return await fn();
  } finally {
    const processingLabel = results[0];
    const processingLabelId =
      processingLabel.status === "fulfilled"
        ? processingLabel.value?.id
        : undefined;
    if (processingLabelId) {
      await labelMessage({
        gmail,
        messageId,
        removeLabelIds: [processingLabelId],
      }).catch((error) => {
        logger.error("Error removing processing label", { error });
      });
    }
  }
}
