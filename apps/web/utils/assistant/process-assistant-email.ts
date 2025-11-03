import { isDefined, type ParsedMessage } from "@/utils/types";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { processUserRequest } from "@/utils/ai/assistant/process-user-request";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { emailToContent } from "@/utils/mail";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { internalDateToDate } from "@/utils/date";
import type { EmailProvider } from "@/utils/email/types";
import { labelMessageAndSync } from "@/utils/label.server";

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
  const logger = createScopedLogger("process-assistant-email").with({
    emailAccountId,
    threadId: message.threadId,
    messageId: message.id,
  });

  return withProcessingLabels(
    message.id,
    provider,
    emailAccountId,
    () =>
      processAssistantEmailInternal({
        emailAccountId,
        userEmail,
        message,
        provider,
        logger,
      }),
    logger,
  );
}

async function processAssistantEmailInternal({
  emailAccountId,
  userEmail,
  message,
  provider,
  logger,
}: ProcessAssistantEmailArgs & { logger: Logger }) {
  if (!verifyUserSentEmail({ message, userEmail })) {
    logger.error("Unauthorized assistant access attempt", {
      email: userEmail,
      from: message.headers.from,
      to: message.headers.to,
    });
    throw new Error("Unauthorized assistant access attempt");
  }

  logger.info("Processing assistant email");

  // 1. get thread
  // 2. get first message in thread to the personal assistant
  // 3. get the referenced message from that message

  const threadMessages = await provider.getThreadMessages(message.threadId);

  if (!threadMessages?.length) {
    logger.error("No thread messages found");
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

  const [emailAccount, executedRules] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        userId: true,
        email: true,
        about: true,
        multiRuleSelectionEnabled: true,
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
        account: { select: { provider: true } },
      },
    }),
    originalMessage
      ? prisma.executedRule.findMany({
          where: {
            emailAccountId,
            threadId: originalMessage.threadId,
            messageId: originalMessage.id,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            rule: {
              include: {
                actions: true,
                group: true,
              },
            },
          },
        })
      : null,
  ]);

  if (!emailAccount) {
    logger.error("User not found");
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
    logger.error("Assistant message cannot be last");
    return;
  }

  const result = await processUserRequest({
    emailAccount,
    rules: emailAccount.rules,
    originalEmail: originalMessage,
    messages,
    matchedRule: executedRules?.length ? executedRules[0].rule : null, // TODO: support multiple rule matching
  });

  const toolCalls = result.steps.flatMap((step) => step.toolCalls);
  const lastToolCall = toolCalls[toolCalls.length - 1];

  if (lastToolCall?.toolName === "reply") {
    const input = lastToolCall.input as { content: string } | undefined;
    await provider.replyToEmail(message, input?.content || "");
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
  emailAccountId: string,
  fn: () => Promise<T>,
  logger: Logger,
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
    .map((result) => (result.status === "fulfilled" ? result.value : undefined))
    .filter(isDefined);

  if (labels.length) {
    // Fire and forget the initial labeling
    labelMessageAndSync({
      provider,
      messageId,
      labelId: labels[0].id,
      labelName: labels[0].name,
      emailAccountId,
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
      await provider
        .removeThreadLabel(messageId, processingLabelId)
        .catch((error) => {
          logger.error("Error removing processing label", { error });
        });
    }
  }
}
