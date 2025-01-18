import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("AssistantEmail");

// TODO: load full email thread history

export function processAssistantEmail({
  userEmail,
  message,
}: {
  userEmail: string;
  message: ParsedMessage;
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
  // TODO: Process the assistant command
}

function verifyUserSentEmail(message: ParsedMessage, userEmail: string) {
  return message.headers.from.toLowerCase() === userEmail.toLowerCase();
}
