import { revalidatePath } from "next/cache";
import type { gmail_v1 } from "@googleapis/gmail";
import groupBy from "lodash/groupBy";
import { getMessages } from "@/utils/gmail/message";
import { createScopedLogger } from "@/utils/logger";
import { getThreadMessages } from "@/utils/gmail/thread";
import { GmailLabel } from "@/utils/gmail/label";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type { UserEmailWithAI } from "@/utils/llms/types";
import type { User } from "@prisma/client";
import { handleInboundReply } from "@/utils/reply-tracker/inbound";
import { getAssistantEmail } from "@/utils/assistant/is-assistant-email";

const logger = createScopedLogger("reply-tracker/check-previous-emails");

export async function processPreviousSentEmails(
  gmail: gmail_v1.Gmail,
  user: Pick<User, "id" | "about"> & UserEmailWithAI,
  maxResults: number,
) {
  if (!user.email) throw new Error("User email not found");

  const assistantEmail = getAssistantEmail({ userEmail: user.email });

  // Get last sent messages
  const result = await getMessages(gmail, {
    query: `in:sent -to:${assistantEmail} -from:${assistantEmail}`,
    maxResults,
  });

  if (!result.messages) {
    logger.info("No sent messages found");
    return;
  }

  const messagesByThreadId = groupBy(result.messages, (m) => m.threadId);

  // Process each message
  for (const threadId of Object.keys(messagesByThreadId)) {
    const threadMessages = await getThreadMessages(threadId, gmail);

    const latestMessage = threadMessages.sort(
      (a, b) => (Number(b.internalDate) || 0) - (Number(a.internalDate) || 0),
    )[0];

    if (!latestMessage.id || !latestMessage.threadId) continue;

    const loggerOptions = {
      email: user.email,
      messageId: latestMessage.id,
      threadId: latestMessage.threadId,
    };

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
