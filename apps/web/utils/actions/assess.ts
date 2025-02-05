"use server";

import uniq from "lodash/uniq";
import countBy from "lodash/countBy";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import type { gmail_v1 } from "@googleapis/gmail";
import { queryBatchMessages } from "@/utils/gmail/message";
import { getEmailClient } from "@/utils/mail";
import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";
import { getLabelById, getLabels, GmailLabel } from "@/utils/gmail/label";
import { SafeError } from "@/utils/error";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("actions/assess");

// to help with onboarding and provide the best flow to new users
export const assessUserAction = withActionInstrumentation(
  "assessUser",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not authenticated" };

    const gmail = getGmailClient(session);
    const token = await getGmailAccessToken(session);
    const accessToken = token?.token;

    if (!accessToken) throw new SafeError("Missing access token");

    const assessedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { behaviorProfile: true },
    });

    if (assessedUser?.behaviorProfile) return { success: true, skipped: true };

    const result = await assessUser({ gmail, accessToken });
    await saveBehaviorProfile(session.user.email, result);

    return { success: true };
  },
);

async function assessUser({
  gmail,
  accessToken,
}: {
  gmail: gmail_v1.Gmail;
  accessToken: string;
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
  const emailClients = await getEmailClients(gmail, accessToken);

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

async function saveBehaviorProfile(
  email: string,
  assessment: Awaited<ReturnType<typeof assessUser>>,
) {
  await prisma.user.update({
    where: { email },
    data: { behaviorProfile: assessment },
  });
}

async function getUnreadEmailCount(gmail: gmail_v1.Gmail) {
  const label = await getLabelById({ gmail, id: GmailLabel.UNREAD });
  const unreadCount = label?.messagesUnread || 0;
  return unreadCount;
}

async function getInboxCount(gmail: gmail_v1.Gmail) {
  const label = await getLabelById({ gmail, id: GmailLabel.INBOX });
  const inboxCount = label?.messagesTotal || 0;
  return inboxCount;
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
  const res = await gmail.users.settings.filters.list({ userId: "me" });
  const filters = res.data.filter || [];
  return filters.length;
}

async function getForwardingAddressesCount(gmail: gmail_v1.Gmail) {
  try {
    const res = await gmail.users.settings.forwardingAddresses.list({
      userId: "me",
    });
    return res.data.forwardingAddresses?.length || 0;
  } catch (error) {
    // Can happen due to "Forwarding features disabled by administrator"
    logger.error("Error getting forwarding addresses", { error });
    return 0;
  }
}

async function getEmailClients(gmail: gmail_v1.Gmail, accessToken: string) {
  try {
    const { messages } = await queryBatchMessages(gmail, accessToken, {
      query: "from:me",
    });

    // go through the messages, and check the headers for the email client
    const clients = messages
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
