import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { getOriginalMessageId } from "@/utils/assistant/get-original-message-id";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import { processUserRequest } from "@/utils/ai/assistant/process-user-request";

const logger = createScopedLogger("AssistantEmail");

// TODO: load full email thread history

export async function processAssistantEmail({
  userEmail,
  message,
  gmail,
}: {
  userEmail: string;
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
    return;
  }

  // TODO:
  // await processUserRequest({
  // });
}

function verifyUserSentEmail(message: ParsedMessage, userEmail: string) {
  return message.headers.from.toLowerCase() === userEmail.toLowerCase();
}
