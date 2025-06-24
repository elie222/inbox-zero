import { revalidatePath } from "next/cache";
import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { getThreadMessages, getThreads } from "@/utils/gmail/thread";
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
  gmail,
  emailAccount,
  maxResults = 100,
}: {
  gmail: gmail_v1.Gmail;
  emailAccount: EmailAccountWithAI;
  maxResults?: number;
}) {
  const assistantEmail = getAssistantEmail({ userEmail: emailAccount.email });

  // Get last sent messages
  const result = await getThreads(
    `in:sent -to:${assistantEmail} -from:${assistantEmail}`,
    [GmailLabel.SENT],
    gmail,
    maxResults,
  );

  if (!result.threads) {
    logger.info("No sent messages found");
    return;
  }

  // Process each message
  for (const thread of result.threads) {
    const threadMessages = await getThreadMessages(thread.id, gmail);

    // Check if the thread is archived by looking at its labels
    const isArchived = threadMessages.every(
      (message) => !message.labelIds?.includes(GmailLabel.INBOX),
    );

    if (isArchived) {
      logger.trace("Skipping archived thread", {
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
      if (latestMessage.labelIds?.includes(GmailLabel.SENT)) {
        // outbound
        logger.info("Processing outbound reply", loggerOptions);
        await handleOutboundReply({
          emailAccount,
          message: latestMessage,
          gmail,
        });
      } else {
        // inbound
        logger.info("Processing inbound reply", loggerOptions);

        const provider = await createEmailProvider({
          emailAccountId: emailAccount.id,
          provider: "google",
        });

        await handleInboundReply({
          emailAccount,
          message: latestMessage,
          client: provider,
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
