import { isDefined, type ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { processUserRequest } from "@/utils/ai/assistant/process-user-request";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { emailToContent } from "@/utils/mail";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { internalDateToDate } from "@/utils/date";
import type { EmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("process-assistant-email");

type ProcessAssistantEmailArgs = {
  emailAccountId: string;
  userEmail: string;
  message: ParsedMessage;
  provider: EmailProvider;
};

export async function processAssistantEmail({
  emailAccountId,
  userEmail,
  message,
  provider,
}: ProcessAssistantEmailArgs) {
  return withProcessingLabels(message.id, provider, () =>
    processAssistantEmailInternal({
      emailAccountId,
      userEmail,
      message,
      provider,
    }),
  );
}

async function processAssistantEmailInternal({
  emailAccountId,
  userEmail,
  message,
  provider,
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

  const threadMessages = await provider.getThreadMessages(message.threadId);

  if (!threadMessages?.length) {
    logger.error("No thread messages found", loggerOptions);
    await provider.replyToEmail(
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
    await provider.replyToEmail(
      message,
      "Something went wrong. I couldn't find the first message to the personal assistant.",
    );
    return;
  }

  const originalMessageId = firstMessageToAssistant.headers["in-reply-to"];
  const originalMessage = await provider.getOriginalMessage(originalMessageId);

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
    await provider.replyToEmail(message, lastToolCall.args.content);
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

// Label the message with processing and assistant labels, and remove the processing label when done
async function withProcessingLabels<T>(
  messageId: string,
  provider: EmailProvider,
  fn: () => Promise<T>,
): Promise<T> {
  // Get labels first so we can reuse them
  const results = await Promise.allSettled([
    provider.getOrCreateInboxZeroLabel("processing"),
    provider.getOrCreateInboxZeroLabel("assistant"),
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
    provider.labelMessage(messageId, labels[0]).catch((error) => {
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
      await provider
        .removeThreadLabel(messageId, processingLabelId)
        .catch((error) => {
          logger.error("Error removing processing label", { error });
        });
    }
  }
}
