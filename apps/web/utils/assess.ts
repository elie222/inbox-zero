import uniq from "lodash/uniq";
import countBy from "lodash/countBy";
import type { gmail_v1 } from "@googleapis/gmail";
import { queryBatchMessages } from "@/utils/gmail/message";
import { getEmailClient } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getLabelById, getLabels, GmailLabel } from "@/utils/gmail/label";
import { getFilters, getForwardingAddresses } from "@/utils/gmail/settings";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("utils/assess");

export async function assessUser({
  gmail,
}: {
  gmail: gmail_v1.Gmail;
}) {
  // how many unread emails?
  const unreadCount = await getUnreadEmailCount(gmail);
  // how many unarchived emails?
  const inboxCount = await getInboxCount(gmail);
  // how many sent emails?
  const sentCount = await getSentCount(gmail);

  // does user make use of labels?
  const labelCount = await getLabelCount(gmail);

  // does user have any filters?
  const filtersCount = await getFiltersCount(gmail);

  // does user have any auto-forwarding rules?
  // TODO

  // does user forward emails to other accounts?
  const forwardingAddressesCount = await getForwardingAddressesCount(gmail);

  // does user use snippets?
  // Gmail API doesn't provide a way to check this
  // TODO We could check it with embeddings

  // what email client does user use?
  const emailClients = await getEmailClients(gmail);

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

async function getUnreadEmailCount(gmail: gmail_v1.Gmail) {
  const label = await getLabelById({ gmail, id: GmailLabel.UNREAD });
  const unreadCount = label?.messagesUnread || 0;
  return unreadCount;
}

export async function getInboxCount(gmail: gmail_v1.Gmail) {
  const label = await getLabelById({ gmail, id: GmailLabel.INBOX });
  const inboxCount = label?.messagesTotal || 0;
  return inboxCount;
}

export async function getUnreadCount(gmail: gmail_v1.Gmail) {
  const label = await getLabelById({ gmail, id: GmailLabel.UNREAD });
  const unreadCount = label?.messagesUnread || 0;
  return unreadCount;
}

async function getSentCount(gmail: gmail_v1.Gmail) {
  const label = await getLabelById({ gmail, id: GmailLabel.SENT });
  const sentCount = label?.messagesTotal || 0;
  return sentCount;
}

async function getLabelCount(gmail: gmail_v1.Gmail) {
  const labels = (await getLabels(gmail)) || [];
  const DEFAULT_LABEL_COUNT = 13;
  return labels.length - DEFAULT_LABEL_COUNT;
}

async function getFiltersCount(gmail: gmail_v1.Gmail) {
  const filters = await getFilters(gmail);
  return filters.length;
}

async function getForwardingAddressesCount(gmail: gmail_v1.Gmail) {
  try {
    const forwardingAddresses = await getForwardingAddresses(gmail);
    return forwardingAddresses.length;
  } catch (error) {
    // Can happen due to "Forwarding features disabled by administrator"
    logger.error("Error getting forwarding addresses", { error });
    return 0;
  }
}

async function getEmailClients(gmail: gmail_v1.Gmail) {
  try {
    const { messages } = await queryBatchMessages(gmail, {
      query: "from:me",
    });

    // go through the messages, and check the headers for the email client
    const clients = messages
      .filter((message) => message.labelIds?.includes(GmailLabel.SENT))
      .map((message) => {
        return (
          message.headers["message-id"] &&
          getEmailClient(message.headers["message-id"])
        );
      })
      .filter(isDefined);

    const counts = countBy(clients);
    const mostPopular = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    return { clients: uniq(clients), primary: mostPopular[0][0] };
  } catch (error) {
    logger.error("Error getting email clients", { error });
  }
}

export async function getUnhandledCount(gmail: gmail_v1.Gmail): Promise<{
  unhandledCount: number;
  type: "inbox" | "unread";
}> {
  const [inboxCount, unreadCount] = await Promise.all([
    getInboxCount(gmail),
    getUnreadCount(gmail),
  ]);
  const unhandledCount = Math.min(unreadCount, inboxCount);
  return {
    unhandledCount,
    type: unhandledCount === inboxCount ? "inbox" : "unread",
  };
}
