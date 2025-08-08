import uniq from "lodash/uniq";
import countBy from "lodash/countBy";
import type { EmailProvider } from "@/utils/email/types";
import { GmailProvider } from "@/utils/email/google";
import { getEmailClient } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { GmailLabel } from "@/utils/gmail/label";
import { OutlookLabel } from "@/utils/outlook/label";
import { getFilters, getForwardingAddresses } from "@/utils/gmail/settings";

const logger = createScopedLogger("utils/assess");

export async function assessUser({ client }: { client: EmailProvider }) {
  // how many unread emails?
  const unreadCount = await getUnreadEmailCount(client);
  // how many unarchived emails?
  const inboxCount = await getInboxCount(client);
  // how many sent emails?
  const sentCount = await getSentCount(client);

  // does user make use of labels?
  const labelCount = await getLabelCount(client);

  // does user have any filters?
  const filtersCount = await getFiltersCount(client);

  // does user have any auto-forwarding rules?
  // TODO

  // does user forward emails to other accounts?
  const forwardingAddressesCount = await getForwardingAddressesCount(client);

  // does user use snippets?
  // Gmail API doesn't provide a way to check this
  // TODO We could check it with embeddings

  // what email client does user use?
  const emailClients = await getEmailClients(client);

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

async function getUnreadEmailCount(client: EmailProvider) {
  if (client instanceof GmailProvider) {
    const label = await client.getLabelById(GmailLabel.UNREAD);
    return label?.threadsTotal || 0;
  } else {
    const label = await client.getLabelById(OutlookLabel.UNREAD);
    return label?.threadsTotal || 0;
  }
}

export async function getInboxCount(client: EmailProvider) {
  if (client instanceof GmailProvider) {
    const label = await client.getLabelById(GmailLabel.INBOX);
    return label?.threadsTotal || 0;
  } else {
    const label = await client.getLabelById(OutlookLabel.INBOX);
    return label?.threadsTotal || 0;
  }
}

export async function getUnreadCount(client: EmailProvider) {
  if (client instanceof GmailProvider) {
    const label = await client.getLabelById(GmailLabel.UNREAD);
    return label?.threadsTotal || 0;
  } else {
    const label = await client.getLabelById(OutlookLabel.UNREAD);
    return label?.threadsTotal || 0;
  }
}

async function getSentCount(client: EmailProvider) {
  if (client instanceof GmailProvider) {
    const label = await client.getLabelById(GmailLabel.SENT);
    return label?.threadsTotal || 0;
  } else {
    const label = await client.getLabelById(OutlookLabel.SENT);
    return label?.threadsTotal || 0;
  }
}

async function getLabelCount(client: EmailProvider) {
  const labels = await client.getLabels();
  if (client instanceof GmailProvider) {
    const DEFAULT_LABEL_COUNT = 13;
    return labels.length - DEFAULT_LABEL_COUNT;
  } else {
    const DEFAULT_LABEL_COUNT = 8;
    return labels.length - DEFAULT_LABEL_COUNT;
  }
}

async function getFiltersCount(client: EmailProvider) {
  if (client instanceof GmailProvider) {
    const gmail = (client as any).client; // Access the internal Gmail client
    const filters = await getFilters(gmail);
    return filters.length;
  }
  // Outlook doesn't have a direct equivalent to Gmail filters
  return 0;
}

async function getForwardingAddressesCount(client: EmailProvider) {
  if (client instanceof GmailProvider) {
    try {
      const gmail = (client as any).client; // Access the internal Gmail client
      const forwardingAddresses = await getForwardingAddresses(gmail);
      return forwardingAddresses.length;
    } catch (error) {
      // Can happen due to "Forwarding features disabled by administrator"
      logger.error("Error getting forwarding addresses", { error });
      return 0;
    }
  }
  // Outlook doesn't have a direct equivalent to Gmail forwarding
  return 0;
}

async function getEmailClients(client: EmailProvider) {
  try {
    const messages = await client.getMessages("from:me", 50);

    // go through the messages, and check the headers for the email client
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

export async function getUnhandledCount(client: EmailProvider): Promise<{
  unhandledCount: number;
  type: "inbox" | "unread";
}> {
  const [inboxCount, unreadCount] = await Promise.all([
    getInboxCount(client),
    getUnreadCount(client),
  ]);
  const unhandledCount = Math.min(unreadCount, inboxCount);
  return {
    unhandledCount,
    type: unhandledCount === inboxCount ? "inbox" : "unread",
  };
}
