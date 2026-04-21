import {
  MessagingProvider,
  MessagingRoutePurpose,
  type MessagingRouteTargetType,
  ThreadTrackerType,
} from "@/generated/prisma/enums";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import type { Logger } from "@/utils/logger";
import {
  resolveSlackRouteDestination,
  sendFollowUpReminderToSlack,
} from "@/utils/messaging/providers/slack/send";
import {
  getMessagingRoute,
  getMessagingRouteWhere,
} from "@/utils/messaging/routes";
import { isMessagingChannelOperational } from "@/utils/messaging/channel-validity";
import prisma from "@/utils/prisma";

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
  subject,
  sender,
  trackerType,
  daysSinceSent,
  threadLink,
  logger,
}: {
  channels: FollowUpNotificationChannel[];
  subject: string;
  sender: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  threadLink?: string;
  logger: Logger;
}): Promise<{ anySucceeded: boolean }> {
  const deliveryPromises: Promise<void>[] = [];

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
            subject,
            sender,
            trackerType,
            daysSinceSent,
            threadLink,
            logger,
          }),
        );
        break;
      case MessagingProvider.TEAMS:
      case MessagingProvider.TELEGRAM:
        deliveryPromises.push(
          sendFollowUpViaMessagingApp({
            channel,
            route,
            subject,
            sender,
            trackerType,
            daysSinceSent,
            threadLink,
            logger,
          }),
        );
        break;
    }
  }

  if (deliveryPromises.length === 0) {
    return { anySucceeded: false };
  }

  const results = await Promise.allSettled(deliveryPromises);
  let anySucceeded = false;
  for (const result of results) {
    if (result.status === "fulfilled") {
      anySucceeded = true;
    } else {
      logger.error("Follow-up delivery channel failed", {
        reason: result.reason,
      });
    }
  }

  return { anySucceeded };
}

async function sendFollowUpViaSlack({
  accessToken,
  route,
  subject,
  sender,
  trackerType,
  daysSinceSent,
  threadLink,
  logger,
}: {
  accessToken: string;
  route: { targetId: string; targetType: MessagingRouteTargetType };
  subject: string;
  sender: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  threadLink?: string;
  logger: Logger;
}) {
  const destination = await resolveSlackRouteDestination({
    accessToken,
    route,
  });

  if (!destination) {
    // Throw so the outer Promise.allSettled records this as a failure;
    // otherwise anySucceeded would flip true and followUpNotifiedAt would
    // be set, permanently suppressing retries for this thread+message.
    throw new Error("No Slack destination resolved for follow-up notification");
  }

  await sendFollowUpReminderToSlack({
    accessToken,
    channelId: destination,
    subject,
    sender,
    trackerType,
    daysSinceSent,
    threadLink,
  });
}

async function sendFollowUpViaMessagingApp({
  channel,
  route,
  subject,
  sender,
  trackerType,
  daysSinceSent,
  threadLink,
  logger,
}: {
  channel: {
    provider: MessagingProvider;
    accessToken: string | null;
    teamId: string | null;
    providerUserId: string | null;
  };
  route: { targetId: string; targetType: MessagingRouteTargetType };
  subject: string;
  sender: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  threadLink?: string;
  logger: Logger;
}) {
  await sendAutomationMessage({
    channel,
    route,
    text: formatFollowUpText({
      subject,
      sender,
      trackerType,
      daysSinceSent,
      threadLink,
    }),
    logger,
  });
}

function formatFollowUpText({
  subject,
  sender,
  trackerType,
  daysSinceSent,
  threadLink,
}: {
  subject: string;
  sender: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  threadLink?: string;
}): string {
  const header =
    trackerType === ThreadTrackerType.AWAITING
      ? "Follow-up nudge"
      : "Reply needed";
  const dayLabel = daysSinceSent === 1 ? "day" : "days";
  const verb = trackerType === ThreadTrackerType.AWAITING ? "sent" : "received";

  const lines = [
    header,
    `${subject}`,
    `from ${sender} · ${verb} ${daysSinceSent} ${dayLabel} ago`,
  ];

  if (threadLink) {
    lines.push(`Open: ${threadLink}`);
  }

  return lines.join("\n");
}
