import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";

export async function getSenderUnsubscribeSource({
  senderEmail,
  emailProvider,
  logger,
}: {
  senderEmail: string;
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<{
  listUnsubscribeHeader?: string;
  unsubscribeLink?: string;
}> {
  try {
    const { messages } = await emailProvider.getMessagesFromSender({
      senderEmail,
      maxResults: 5,
    });

    for (const message of messages) {
      const listUnsubscribeHeader = message.headers["list-unsubscribe"];
      const unsubscribeLink = findUnsubscribeLink(message.textHtml);

      if (listUnsubscribeHeader || unsubscribeLink) {
        return {
          listUnsubscribeHeader,
          unsubscribeLink,
        };
      }
    }
  } catch (error) {
    logger.warn("Failed to fetch sender messages for unsubscribe", { error });
    logger.trace("Sender lookup failed", { senderEmail });
  }

  return {};
}

/**
 * Uses the client-supplied unsubscribe source when one is present. Otherwise
 * reads it from the sender's recent mail.
 */
export async function resolveSenderUnsubscribeSource({
  senderEmail,
  unsubscribeLink,
  listUnsubscribeHeader,
  emailProvider,
  logger,
}: {
  senderEmail: string;
  unsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
  emailProvider: EmailProvider;
  logger: Logger;
}) {
  if (unsubscribeLink || listUnsubscribeHeader) {
    return { unsubscribeLink, listUnsubscribeHeader };
  }

  return getSenderUnsubscribeSource({ senderEmail, emailProvider, logger });
}
