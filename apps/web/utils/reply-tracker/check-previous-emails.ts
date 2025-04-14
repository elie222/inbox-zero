import { revalidatePath } from "next/cache";
import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { getThreadMessages, getThreads } from "@/utils/gmail/thread";
import { GmailLabel } from "@/utils/gmail/label";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { handleInboundReply } from "@/utils/reply-tracker/inbound";
import { getAssistantEmail } from "@/utils/assistant/is-assistant-email";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("reply-tracker/check-previous-emails");

export async function processPreviousSentEmails(
  gmail: gmail_v1.Gmail,
  user: UserEmailWithAI,
  maxResults = 100,
) {
  if (!user.email) throw new Error("User email not found");

  const assistantEmail = getAssistantEmail({ userEmail: user.email });

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

    const sortedMessages = threadMessages.sort(
      (a, b) => (Number(b.internalDate) || 0) - (Number(a.internalDate) || 0),
    );
    const latestMessage = sortedMessages[0];

    if (!latestMessage.id || !latestMessage.threadId) continue;

    const isProcessed = await prisma.executedRule.findUnique({
      where: {
        unique_user_thread_message: {
          userId: user.id,
          threadId: latestMessage.threadId,
          messageId: latestMessage.id,
        },
      },
      select: { id: true },
    });

    const loggerOptions = {
      email: user.email,
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
        await handleOutboundReply(user, latestMessage, gmail);
      } else {
        // inbound
        logger.info("Processing inbound reply", loggerOptions);
        await handleInboundReply(user, latestMessage, gmail);
      }

      revalidatePath("/reply-zero");
    } catch (error) {
      logger.error("Error processing message for reply tracking", {
        ...loggerOptions,
        error,
      });
    }
  }

  logger.info("Processed previous sent emails");
}
