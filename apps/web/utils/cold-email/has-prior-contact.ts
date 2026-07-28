import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

/**
 * Whether the user has corresponded with this sender before, assuming yes whenever we
 * cannot tell.
 *
 * Blocking a sender is compounding: it labels, archives, and on many accounts emails
 * them to say their message was unsolicited. Letting a cold email through costs one
 * email in the inbox. So a missing date, an unreadable message, or a provider outage
 * must all resolve toward leaving the sender alone rather than toward blocking them.
 */
export async function hasPriorContactOrAssumeYes({
  provider,
  from,
  date,
  messageId,
  logger,
}: {
  provider: EmailProvider;
  from: string;
  date: Date | undefined;
  messageId: string | undefined;
  logger: Logger;
}): Promise<boolean> {
  if (!date || !messageId) {
    logger.warn("Assuming prior contact - message is missing a date or id");
    return true;
  }

  try {
    return await provider.hasPreviousCommunicationsWithSenderOrDomain({
      from,
      date,
      messageId,
    });
  } catch (error) {
    logger.warn(
      "Assuming prior contact - could not check for previous emails",
      {
        error,
      },
    );
    return true;
  }
}
