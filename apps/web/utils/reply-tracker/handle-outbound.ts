import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { handleOutboundReply } from "./outbound";
import { trackSentDraftStatus, cleanupThreadAIDrafts } from "./draft-tracking";
import { clearFollowUpLabel } from "@/utils/follow-up/labels";

export async function handleOutboundMessage({
  emailAccount,
  message,
  provider,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  provider: EmailProvider;
  logger: Logger;
}) {
  logger = logger.with({
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
      logger.error("Error tracking sent draft status", { error });
      captureException(error, { emailAccountId: emailAccount.id });
    }),
    handleOutboundReply({
      emailAccount,
      message,
      provider,
      logger,
    }).catch((error) => {
      logger.error("Error handling outbound reply", { error });
      captureException(error, { emailAccountId: emailAccount.id });
    }),
  ]);

  try {
    await cleanupThreadAIDrafts({
      threadId: message.threadId,
      emailAccountId: emailAccount.id,
      provider,
      logger,
    });
  } catch (error) {
    logger.error("Error during thread draft cleanup", { error });
    captureException(error, { emailAccountId: emailAccount.id });
  }

  // Remove follow-up label if present (user replied, so follow-up no longer needed)
  try {
    await clearFollowUpLabel({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      provider,
      logger,
    });
  } catch (error) {
    logger.error("Error removing follow-up label", { error });
    captureException(error, { emailAccountId: emailAccount.id });
  }
}
