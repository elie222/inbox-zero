import { Actions, Card, CardText, LinkButton, type CardChild } from "chat";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  type MessagingRouteTargetType,
  type ThreadTrackerType,
} from "@/generated/prisma/enums";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import type { Logger } from "@/utils/logger";
import {
  resolveSlackRouteDestination,
  sendFollowUpReminderToSlack,
} from "@/utils/messaging/providers/slack/send";
import { getMessagingAdapterRegistry } from "@/utils/messaging/chat-sdk/adapters";
import {
  getMessagingRoute,
  getMessagingRouteWhere,
} from "@/utils/messaging/routes";
import { isMessagingChannelOperational } from "@/utils/messaging/channel-validity";
import prisma from "@/utils/prisma";
import { pluralize } from "@/utils/string";
import {
  getFollowUpCopy,
  normalizeFollowUpText,
  truncateSnippet,
} from "@/utils/follow-up/copy";
import {
  saveMessagingFollowUpContext,
  type MessagingFollowUpContext,
} from "@/utils/redis/messaging-follow-up-context";

const TELEGRAM_SNIPPET_MAX_CHARS = 3000;

export type FollowUpNotificationChannel = {
  id: string;
  provider: MessagingProvider;
  isConnected: boolean;
  accessToken: string | null;
  teamId: string | null;
  providerUserId: string | null;
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetType: MessagingRouteTargetType;
    targetId: string;
  }>;
};

type FollowUpNotificationContent = {
  subject: string;
  counterpartyName: string;
  counterpartyEmail: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  snippet?: string;
  threadLink?: string;
  threadLinkLabel?: string;
  trackerId: string;
};

type FollowUpEmailReference = Pick<
  MessagingFollowUpContext,
  "emailAccountId" | "threadId" | "messageId"
>;

export async function getFollowUpNotificationChannels(
  emailAccountId: string,
): Promise<FollowUpNotificationChannel[]> {
  return prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      ...getMessagingRouteWhere(MessagingRoutePurpose.FOLLOW_UPS),
    },
    select: {
      id: true,
      provider: true,
      isConnected: true,
      accessToken: true,
      teamId: true,
      providerUserId: true,
      routes: {
        select: { purpose: true, targetType: true, targetId: true },
      },
    },
  });
}

export async function sendFollowUpNotification({
  channels,
  emailReference,
  logger,
  ...content
}: FollowUpNotificationContent & {
  channels: FollowUpNotificationChannel[];
  emailReference: FollowUpEmailReference;
  logger: Logger;
}): Promise<void> {
  const deliveryPromises: Promise<unknown>[] = [];

  for (const channel of channels) {
    const route = getMessagingRoute(
      channel.routes,
      MessagingRoutePurpose.FOLLOW_UPS,
    );
    if (!route) continue;
    if (!isMessagingChannelOperational(channel)) {
      logger.warn(
        "Skipping follow-up notification for invalid messaging channel",
        {
          messagingChannelId: channel.id,
          provider: channel.provider,
        },
      );
      continue;
    }

    switch (channel.provider) {
      case MessagingProvider.SLACK:
        if (!channel.accessToken) continue;
        deliveryPromises.push(
          sendFollowUpViaSlack({
            accessToken: channel.accessToken,
            route,
            content,
            emailReference,
            logger,
          }),
        );
        break;
      case MessagingProvider.TEAMS:
        deliveryPromises.push(
          sendAutomationMessage({
            channel,
            route,
            text: formatFollowUpText(content),
            logger,
          }),
        );
        break;
      case MessagingProvider.TELEGRAM:
        deliveryPromises.push(
          sendFollowUpViaTelegram({
            channel,
            route,
            content,
            emailReference,
            logger,
          }),
        );
        break;
    }
  }

  if (deliveryPromises.length === 0) return;

  const results = await Promise.allSettled(deliveryPromises);
  for (const result of results) {
    if (result.status === "rejected") {
      logger.error("Follow-up delivery channel failed", {
        reason: result.reason,
      });
    }
  }
}

async function sendFollowUpViaSlack({
  accessToken,
  route,
  content,
  emailReference,
  logger,
}: {
  accessToken: string;
  route: { targetId: string; targetType: MessagingRouteTargetType };
  content: FollowUpNotificationContent;
  emailReference: FollowUpEmailReference;
  logger: Logger;
}) {
  const destination = await resolveSlackRouteDestination({
    accessToken,
    route,
  });

  if (!destination) {
    logger.warn("No Slack destination resolved for follow-up notification");
    return;
  }

  const { channelId, messageTs } = await sendFollowUpReminderToSlack({
    accessToken,
    channelId: destination,
    ...content,
  });

  if (!messageTs) {
    logger.warn(
      "Slack follow-up notification sent but no message ts returned; thread reply context will be unavailable",
    );
    return;
  }

  await saveMessagingFollowUpContext(
    { provider: "slack", channelId, messageTs },
    buildFollowUpContextValue(content, emailReference),
  );
}

async function sendFollowUpViaTelegram({
  channel,
  route,
  content,
  emailReference,
  logger,
}: {
  channel: FollowUpNotificationChannel;
  route: { targetId: string; targetType: MessagingRouteTargetType };
  content: FollowUpNotificationContent;
  emailReference: FollowUpEmailReference;
  logger: Logger;
}) {
  const destination =
    route.targetId || channel.teamId || channel.providerUserId;

  if (!destination) {
    logger.warn("No Telegram destination resolved for follow-up notification");
    return;
  }

  const telegramAdapter = getMessagingAdapterRegistry().typedAdapters.telegram;
  if (!telegramAdapter) {
    throw new Error("Telegram adapter is not configured");
  }

  const threadId = await telegramAdapter.openDM(destination);
  const sentMessage = await telegramAdapter.postMessage(
    threadId,
    buildTelegramFollowUpCard(content),
  );

  const telegramChatId = telegramAdapter.decodeThreadId(threadId).chatId;
  const messageTs = sentMessage?.id;
  if (!messageTs) {
    logger.warn(
      "Telegram follow-up notification sent but no message id returned; thread reply context will be unavailable",
    );
    return;
  }

  await saveMessagingFollowUpContext(
    { provider: "telegram", channelId: telegramChatId, messageTs },
    buildFollowUpContextValue(content, emailReference),
  );
}

function formatFollowUpText({
  subject,
  counterpartyName,
  counterpartyEmail,
  trackerType,
  daysSinceSent,
  snippet,
  threadLink,
}: FollowUpNotificationContent): string {
  const { directionLine, counterpartyPrefix, emoji } =
    getFollowUpCopy(trackerType);

  const lines = [
    `${emoji} Follow-up nudge — ${directionLine}`,
    normalizeFollowUpText(subject),
    `${counterpartyPrefix} ${normalizeFollowUpText(counterpartyName)} <${counterpartyEmail}> · ${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`,
  ];

  const formattedSnippet = snippet ? formatQuotedSnippet(snippet) : "";
  if (formattedSnippet) lines.push(formattedSnippet);
  if (threadLink) lines.push(`Open: ${threadLink}`);

  return lines.join("\n");
}

function buildTelegramFollowUpCard({
  subject,
  counterpartyName,
  counterpartyEmail,
  trackerType,
  daysSinceSent,
  snippet,
  threadLink,
  threadLinkLabel,
}: FollowUpNotificationContent) {
  const { directionLine, counterpartyPrefix, snippetLabel, emoji } =
    getFollowUpCopy(trackerType);
  const children: CardChild[] = [
    CardText(
      [
        directionLine,
        normalizeFollowUpText(subject),
        `${counterpartyPrefix} ${normalizeFollowUpText(counterpartyName)} <${counterpartyEmail}> · ${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`,
      ].join("\n\n"),
    ),
  ];

  const formattedSnippet = snippet
    ? formatQuotedSnippet(snippet, TELEGRAM_SNIPPET_MAX_CHARS)
    : "";

  if (formattedSnippet) {
    children.push(CardText(`${snippetLabel}:\n${formattedSnippet}`));
  }

  if (threadLink) {
    children.push(
      Actions([
        LinkButton({
          label: threadLinkLabel ?? "Open email",
          url: threadLink,
        }),
      ]),
    );
  }

  return Card({
    title: `${emoji} Follow-up nudge`,
    children,
  });
}

function formatQuotedSnippet(snippet: string, maxChars?: number): string {
  return truncateSnippet(snippet, maxChars)
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function buildFollowUpContextValue(
  content: FollowUpNotificationContent,
  emailReference: FollowUpEmailReference,
): MessagingFollowUpContext {
  return {
    emailAccountId: emailReference.emailAccountId,
    threadId: emailReference.threadId,
    messageId: emailReference.messageId,
    trackerId: content.trackerId,
    subject: content.subject,
    counterpartyEmail: content.counterpartyEmail,
  };
}
