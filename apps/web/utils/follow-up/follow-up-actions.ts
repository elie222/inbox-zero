import { Card, CardText, type ActionEvent } from "chat";
import { cardToBlockKit, cardToFallbackText } from "@chat-adapter/slack";
import { MessagingProvider } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import { parseFollowUpNotificationDeliveries } from "@/utils/follow-up/notification-deliveries";
import {
  getSlackTeamId,
  getTelegramChatId,
} from "@/utils/messaging/action-event-identifiers";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import { disableSlackLinkUnfurls } from "@/utils/messaging/providers/slack/send";
import prisma from "@/utils/prisma";

export const FOLLOW_UP_MARK_DONE_ACTION_ID = "follow_up_mark_done";

export const FOLLOW_UP_REMINDER_ACTION_IDS = [
  FOLLOW_UP_MARK_DONE_ACTION_ID,
] as const;

export async function handleFollowUpReminderAction({
  event,
  logger,
}: {
  event: ActionEvent;
  logger: Logger;
}): Promise<void> {
  if (event.actionId !== FOLLOW_UP_MARK_DONE_ACTION_ID) return;

  const trackerId = event.value?.trim();
  if (!trackerId) return;

  const tracker = await prisma.threadTracker.findUnique({
    where: { id: trackerId },
    select: {
      id: true,
      resolved: true,
      emailAccountId: true,
      followUpNotifications: true,
    },
  });

  if (!tracker) {
    await postFeedback(event, logger, "That follow-up is no longer active.");
    return;
  }

  const auth = getProviderAuth(event);
  const channel = auth
    ? await prisma.messagingChannel.findFirst({
        where: {
          emailAccountId: tracker.emailAccountId,
          provider: auth.provider,
          teamId: auth.teamId,
          providerUserId: event.user.userId,
          isConnected: true,
        },
        select: { id: true },
      })
    : null;

  if (!channel) {
    await postFeedback(
      event,
      logger,
      "You don't have permission to act on this follow-up.",
    );
    return;
  }

  await prisma.threadTracker.update({
    where: { id: trackerId },
    data: getInitialResolvedUpdateData(tracker.followUpNotifications),
  });

  const feedback = tracker.resolved
    ? "This follow-up is already done."
    : "Marked done. We won't follow up on this thread again.";

  const storedNotificationResult = await replaceStoredResolvedCards({
    emailAccountId: tracker.emailAccountId,
    notifications: tracker.followUpNotifications,
    logger,
  });
  const fallbackResult =
    storedNotificationResult !== "replaced"
      ? await replaceWithResolvedCard(event, logger)
      : false;

  const shouldClearNotificationReferences =
    storedNotificationResult === "replaced" ||
    (storedNotificationResult === "failed" && fallbackResult);

  await Promise.all([
    shouldClearNotificationReferences &&
      prisma.threadTracker.update({
        where: { id: trackerId },
        data: { followUpNotifications: Prisma.JsonNull },
      }),
    postFeedback(event, logger, feedback),
  ]);
}

async function replaceWithResolvedCard(
  event: ActionEvent,
  logger: Logger,
): Promise<boolean> {
  if (!event.threadId || !event.messageId) return false;

  try {
    await event.adapter.editMessage(
      event.threadId,
      event.messageId,
      buildResolvedCard(),
    );
    return true;
  } catch (error) {
    logger.warn("Failed to update follow-up notification after Mark done", {
      actionId: event.actionId,
      error,
    });
    return false;
  }
}

function getInitialResolvedUpdateData(followUpNotifications: unknown) {
  const notifications = parseFollowUpNotificationDeliveries(
    followUpNotifications,
  );

  return notifications.length === 0
    ? { resolved: true, followUpNotifications: Prisma.JsonNull }
    : { resolved: true };
}

async function replaceStoredResolvedCards({
  emailAccountId,
  notifications,
  logger,
}: {
  emailAccountId: string;
  notifications: unknown;
  logger: Logger;
}): Promise<"none" | "replaced" | "failed"> {
  const parsedNotifications =
    parseFollowUpNotificationDeliveries(notifications);
  if (parsedNotifications.length === 0) return "none";

  const messagingChannelIds = [
    ...new Set(
      parsedNotifications.map(
        (notification) => notification.messagingChannelId,
      ),
    ),
  ];
  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      id: { in: messagingChannelIds },
      isConnected: true,
    },
    select: {
      id: true,
      accessToken: true,
    },
  });
  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );
  const card = buildResolvedCard();

  const results = await Promise.all(
    parsedNotifications.map(async (notification) => {
      const channel = channelsById.get(notification.messagingChannelId);
      if (!channel) return true;

      if (notification.provider !== MessagingProvider.SLACK) return false;
      if (!channel.accessToken) return true;

      try {
        await createSlackClient(channel.accessToken).chat.update(
          disableSlackLinkUnfurls({
            channel: notification.providerThreadId,
            ts: notification.providerMessageId,
            text: cardToFallbackText(card),
            blocks: cardToBlockKit(card),
          }),
        );
        return true;
      } catch (error) {
        logger.warn("Failed to update stored Slack follow-up notification", {
          messagingChannelId: notification.messagingChannelId,
          error,
        });
        return false;
      }
    }),
  );

  return results.every(Boolean) ? "replaced" : "failed";
}

function buildResolvedCard() {
  return Card({
    title: "✅ Follow-up marked done",
    children: [CardText("We won't follow up on this thread again.")],
  });
}

async function postFeedback(
  event: ActionEvent,
  logger: Logger,
  text: string,
): Promise<void> {
  const thread = event.thread;
  if (!thread) return;

  if (event.adapter.name === "slack") {
    try {
      await thread.postEphemeral(event.user, text, { fallbackToDM: false });
      return;
    } catch (error) {
      logger.warn("Failed to post follow-up feedback (slack ephemeral)", {
        actionId: event.actionId,
        error,
      });
    }
  }

  try {
    await thread.post(text);
  } catch (error) {
    logger.warn("Failed to post follow-up feedback", {
      actionId: event.actionId,
      error,
    });
  }
}

function getProviderAuth(
  event: ActionEvent,
): { provider: MessagingProvider; teamId: string } | null {
  if (event.adapter.name === "slack") {
    const teamId = getSlackTeamId(event.raw);
    return teamId ? { provider: MessagingProvider.SLACK, teamId } : null;
  }
  if (event.adapter.name === "telegram") {
    const teamId = getTelegramChatId(event);
    return teamId ? { provider: MessagingProvider.TELEGRAM, teamId } : null;
  }
  return null;
}
