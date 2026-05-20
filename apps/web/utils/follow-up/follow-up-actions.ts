import { Card, CardText, type ActionEvent, type CardElement } from "chat";
import { cardToBlockKit, cardToFallbackText } from "@chat-adapter/slack";
import { MessagingProvider } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import {
  parseFollowUpNotificationDeliveries,
  type FollowUpNotificationDelivery,
} from "@/utils/follow-up/notification-deliveries";
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

  const storedNotifications = parseFollowUpNotificationDeliveries(
    tracker.followUpNotifications,
  );
  const card = buildResolvedCard();

  // Mark resolved up front so the action is idempotent if subsequent steps fail.
  await prisma.threadTracker.update({
    where: { id: trackerId },
    data:
      storedNotifications.length === 0
        ? { resolved: true, followUpNotifications: Prisma.JsonNull }
        : { resolved: true },
  });

  const allStoredReplaced =
    storedNotifications.length > 0 &&
    (await replaceStoredResolvedCards({
      emailAccountId: tracker.emailAccountId,
      notifications: storedNotifications,
      card,
      logger,
    }));

  const fallbackHandled =
    !allStoredReplaced && (await replaceWithResolvedCard(event, card, logger));

  const shouldClearNotificationReferences =
    storedNotifications.length > 0 && (allStoredReplaced || fallbackHandled);

  const feedback = tracker.resolved
    ? "This follow-up is already done."
    : "Marked done. We won't follow up on this thread again.";

  await Promise.all([
    shouldClearNotificationReferences
      ? prisma.threadTracker.update({
          where: { id: trackerId },
          data: { followUpNotifications: Prisma.JsonNull },
        })
      : null,
    postFeedback(event, logger, feedback),
  ]);
}

async function replaceWithResolvedCard(
  event: ActionEvent,
  card: CardElement,
  logger: Logger,
): Promise<boolean> {
  if (!event.threadId || !event.messageId) return false;

  try {
    await event.adapter.editMessage(event.threadId, event.messageId, card);
    return true;
  } catch (error) {
    logger.warn("Failed to update follow-up notification after Mark done", {
      actionId: event.actionId,
      error,
    });
    return false;
  }
}

async function replaceStoredResolvedCards({
  emailAccountId,
  notifications,
  card,
  logger,
}: {
  emailAccountId: string;
  notifications: FollowUpNotificationDelivery[];
  card: CardElement;
  logger: Logger;
}): Promise<boolean> {
  const messagingChannelIds = [
    ...new Set(
      notifications.map((notification) => notification.messagingChannelId),
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
  const text = cardToFallbackText(card);
  const blocks = cardToBlockKit(card);

  const results = await Promise.all(
    notifications.map(async (notification) => {
      const channel = channelsById.get(notification.messagingChannelId);
      if (!channel) return true;

      if (notification.provider !== MessagingProvider.SLACK) return false;
      if (!channel.accessToken) return true;

      try {
        await createSlackClient(channel.accessToken).chat.update(
          disableSlackLinkUnfurls({
            channel: notification.providerThreadId,
            ts: notification.providerMessageId,
            text,
            blocks,
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

  return results.every(Boolean);
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
