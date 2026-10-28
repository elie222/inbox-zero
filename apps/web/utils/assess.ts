import uniq from "lodash/uniq";
import countBy from "lodash/countBy";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailClient } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import type { Logger } from "@/utils/logger";
import { GmailLabel } from "@/utils/gmail/label";

const DEFAULT_LABEL_COUNT: Record<EmailProvider["name"], number> = {
  google: 13,
  microsoft: 8,
};

export async function assessUser({
  client,
  logger,
}: {
  client: EmailProvider;
  logger: Logger;
}) {
  const unreadCount = await getLabelThreadCount(client, GmailLabel.UNREAD);
  const inboxCount = await getLabelThreadCount(client, GmailLabel.INBOX);
  const sentCount = await getLabelThreadCount(client, GmailLabel.SENT);
  const labelCount = await getLabelCount(client);
  const filtersCount = await getFiltersCount(client, logger);
  const forwardingAddressesCount = await getForwardingAddressesCount(
    client,
    logger,
  );
  const emailClients = await getEmailClients(client, logger);

  return {
    unreadCount,
    inboxCount,
    sentCount,
    labelCount,
    filtersCount,
    forwardingAddressesCount,
    emailClients,
  };
}

export async function getUnhandledCount(client: EmailProvider): Promise<{
  unhandledCount: number;
  type: "inbox" | "unread";
}> {
  const [inboxCount, unreadCount] = await Promise.all([
    getLabelThreadCount(client, GmailLabel.INBOX),
    getLabelThreadCount(client, GmailLabel.UNREAD),
  ]);
  const unhandledCount = Math.min(unreadCount, inboxCount);
  return {
    unhandledCount,
    type: unhandledCount === inboxCount ? "inbox" : "unread",
  };
}

// Gmail and Outlook share the same system label ids (see OutlookLabel)
async function getLabelThreadCount(client: EmailProvider, labelId: string) {
  const label = await client.getLabelById(labelId);
  return label?.threadsTotal || 0;
}

async function getLabelCount(client: EmailProvider) {
  const labels = await client.getLabels();
  return labels.length - DEFAULT_LABEL_COUNT[client.name];
}

async function getFiltersCount(client: EmailProvider, logger: Logger) {
  try {
    const filters = await client.getFiltersList();
    return filters.length;
  } catch (error) {
    logger.error("Error getting filters", { error });
    return 0;
  }
}

async function getForwardingAddressesCount(
  client: EmailProvider,
  logger: Logger,
) {
  try {
    const forwardingAddresses = await client.getForwardingAddresses();
    return forwardingAddresses.length;
  } catch (error) {
    // Can happen due to "Forwarding features disabled by administrator"
    logger.error("Error getting forwarding addresses", { error });
    return 0;
  }
}

async function getEmailClients(client: EmailProvider, logger: Logger) {
  try {
    const messages = await client.getSentMessages(50);

    const clients = messages
      .filter((message) => message.headers["message-id"])
      .map((message) => {
        const messageId = message.headers["message-id"];
        return messageId ? getEmailClient(messageId) : undefined;
      })
      .filter(isDefined);

    const counts = countBy(clients);
    const mostPopular = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    return { clients: uniq(clients), primary: mostPopular[0]?.[0] };
  } catch (error) {
    logger.error("Error getting email clients", { error });
    return { clients: [], primary: undefined };
  }
}
