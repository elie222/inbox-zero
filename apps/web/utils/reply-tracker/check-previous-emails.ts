import { revalidatePath } from "next/cache";
import { createScopedLogger } from "@/utils/logger";
import { GmailLabel } from "@/utils/gmail/label";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { handleInboundReply } from "@/utils/reply-tracker/inbound";
import { getAssistantEmail } from "@/utils/assistant/is-assistant-email";
import prisma from "@/utils/prisma";
import { prefixPath } from "@/utils/path";
import { createEmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("reply-tracker/check-previous-emails");

export async function processPreviousSentEmails({
  emailAccount,
  maxResults = 100,
}: {
  emailAccount: EmailAccountWithAI;
  maxResults?: number;
}) {
  const assistantEmail = getAssistantEmail({ userEmail: emailAccount.email });

  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account.provider,
  });

  const threads = await emailProvider.getSentThreadsExcluding({
    excludeToEmails: [assistantEmail],
    excludeFromEmails: [assistantEmail],
    maxResults,
  });

  if (!threads || threads.length === 0) {
    logger.info("No sent messages found");
    return;
  }

  // Process each message
  for (const thread of threads) {
    // Get only messages that are in the inbox (not archived)
    const threadMessages = await emailProvider.getThreadMessagesInInbox(
      thread.id,
    );

    // If no inbox messages, skip this thread (it's archived or deleted)
    if (!threadMessages || threadMessages.length === 0) {
      logger.trace("Skipping thread with no inbox messages", {
        email: emailAccount.email,
        threadId: thread.id,
      });
      continue;
    }

    const sortedMessages = threadMessages.sort(
      (a, b) => (Number(b.internalDate) || 0) - (Number(a.internalDate) || 0),
    );
    const latestMessage = sortedMessages[0];

    if (!latestMessage.id || !latestMessage.threadId) continue;

    const isProcessed = await prisma.executedRule.findUnique({
      where: {
        unique_emailAccount_thread_message: {
          emailAccountId: emailAccount.id,
          threadId: latestMessage.threadId,
          messageId: latestMessage.id,
        },
      },
      select: { id: true },
    });

    const loggerOptions = {
      email: emailAccount.email,
      messageId: latestMessage.id,
      threadId: latestMessage.threadId,
    };

    if (isProcessed) {
      logger.trace("Message already processed", loggerOptions);
      continue;
    }

    try {
      const isLatestMessageOutbound =
        latestMessage.labelIds?.includes(GmailLabel.SENT) ||
        latestMessage.headers?.from === emailAccount.email;

      if (isLatestMessageOutbound) {
        // outbound
        logger.info("Processing outbound reply", loggerOptions);
        await handleOutboundReply({
          emailAccount,
          message: latestMessage,
          provider: emailProvider,
        });
      } else {
        // inbound
        logger.info("Processing inbound reply", loggerOptions);
        await handleInboundReply({
          emailAccount,
          message: latestMessage,
          client: emailProvider,
        });
      }

      revalidatePath(prefixPath(emailAccount.id, "/reply-zero"));
    } catch (error) {
      logger.error("Error processing message for reply tracking", {
        ...loggerOptions,
        error,
      });
    }
  }

  logger.info("Processed previous sent emails");
}
