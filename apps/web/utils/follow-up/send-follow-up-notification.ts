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
import { getFollowUpCopy, truncateSnippet } from "@/utils/follow-up/copy";

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
  logger,
  ...content
}: FollowUpNotificationContent & {
  channels: FollowUpNotificationChannel[];
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
  logger,
}: {
  accessToken: string;
  route: { targetId: string; targetType: MessagingRouteTargetType };
  content: FollowUpNotificationContent;
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

  await sendFollowUpReminderToSlack({
    accessToken,
    channelId: destination,
    ...content,
  });
}

async function sendFollowUpViaTelegram({
  channel,
  route,
  content,
  logger,
}: {
  channel: FollowUpNotificationChannel;
  route: { targetId: string; targetType: MessagingRouteTargetType };
  content: FollowUpNotificationContent;
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
  await telegramAdapter.postMessage(
    threadId,
    buildTelegramFollowUpCard(content),
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
  const { directionLine, preposition, verb, emoji } =
    getFollowUpCopy(trackerType);

  const lines = [
    `${emoji} Follow-up nudge — ${directionLine}`,
    subject,
    `${preposition} ${counterpartyName} <${counterpartyEmail}> · ${verb} ${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`,
  ];

  if (snippet) lines.push(`> ${truncateSnippet(snippet)}`);
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
  const { directionLine, preposition, verb, emoji } =
    getFollowUpCopy(trackerType);
  const children: CardChild[] = [
    CardText(
      [
        directionLine,
        subject,
        `${preposition} ${counterpartyName} <${counterpartyEmail}> · ${verb} ${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`,
      ].join("\n\n"),
    ),
  ];

  if (snippet) {
    children.push(CardText(`> ${truncateSnippet(snippet)}`));
  }

  if (threadLink) {
    children.push(
      Actions([
        LinkButton({
          label: threadLinkLabel ?? "Open thread",
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
