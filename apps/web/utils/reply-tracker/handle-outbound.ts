import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import { handleOutboundReply } from "./outbound";
import { trackSentDraftStatus, cleanupThreadAIDrafts } from "./draft-tracking";
import { formatError } from "@/utils/error";

export async function handleOutboundMessage({
  emailAccount,
  message,
  provider,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  provider: EmailProvider;
}) {
  const logger = createScopedLogger("handle-outbound").with({
    email: emailAccount.email,
    messageId: message.id,
    threadId: message.threadId,
  });

  logger.info("Handling outbound message");

  await Promise.allSettled([
    trackSentDraftStatus({
      emailAccountId: emailAccount.id,
      message,
      provider,
      logger,
    }).catch((error) => {
      logger.error("Error tracking sent draft status", {
        error: formatError(error),
      });
    }),
    handleOutboundReply({
      emailAccount,
      message,
      provider,
    }).catch((error) => {
      logger.error("Error handling outbound reply", {
        error: formatError(error),
      });
    }),
  ]);

  try {
    await cleanupThreadAIDrafts({
      threadId: message.threadId,
      emailAccountId: emailAccount.id,
      provider,
      logger,
    });
  } catch (cleanupError) {
    logger.error("Error during thread draft cleanup", {
      error: cleanupError,
    });
  }
}
