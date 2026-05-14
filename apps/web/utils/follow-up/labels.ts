import { Card, CardText, type CardElement } from "chat";
import { cardToBlockKit, cardToFallbackText } from "@chat-adapter/slack";
import prisma from "@/utils/prisma";
import { withPrismaRetry } from "@/utils/prisma-retry";
import type { EmailProvider, EmailLabel } from "@/utils/email/types";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { Prisma } from "@/generated/prisma/client";
import { MessagingProvider } from "@/generated/prisma/enums";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import { disableSlackLinkUnfurls } from "@/utils/messaging/providers/slack/send";
import { getMessagingAdapterRegistry } from "@/utils/messaging/chat-sdk/adapters";
import {
  parseFollowUpNotificationDeliveries,
  type FollowUpNotificationDelivery,
} from "./send-follow-up-notification";

export async function getOrCreateFollowUpLabel(
  provider: EmailProvider,
  existingLabels?: EmailLabel[],
): Promise<{ id: string; name: string }> {
  const existingFromLabels = existingLabels?.find(
    (label) => label.name === FOLLOW_UP_LABEL,
  );
  if (existingFromLabels) {
    return { id: existingFromLabels.id, name: existingFromLabels.name };
  }

  const existingLabel = await provider.getLabelByName(FOLLOW_UP_LABEL);
  if (existingLabel) {
    return { id: existingLabel.id, name: existingLabel.name };
  }

  const createdLabel = await provider.createLabel(FOLLOW_UP_LABEL);
  return { id: createdLabel.id, name: createdLabel.name };
}

export async function applyFollowUpLabel({
  provider,
  threadId,
  messageId,
  labelId,
  logger,
}: {
  provider: EmailProvider;
  threadId: string;
  messageId: string;
  labelId?: string;
  logger: Logger;
}): Promise<void> {
  logger.info("Applying follow-up label", { threadId, messageId });

  const finalLabelId = labelId ?? (await getOrCreateFollowUpLabel(provider)).id;

  await provider.labelMessage({
    messageId,
    labelId: finalLabelId,
    labelName: FOLLOW_UP_LABEL,
  });

  logger.info("Follow-up label applied", { threadId, labelId: finalLabelId });
}

export async function removeFollowUpLabel({
  provider,
  threadId,
  labelId,
  logger,
}: {
  provider: EmailProvider;
  threadId: string;
  labelId?: string;
  logger: Logger;
}): Promise<void> {
  logger.info("Removing follow-up label", { threadId });

  let finalLabelId = labelId;
  if (!finalLabelId) {
    const label = await provider.getLabelByName(FOLLOW_UP_LABEL);
    if (!label) {
      logger.info("Follow-up label does not exist, nothing to remove", {
        threadId,
      });
      return;
    }
    finalLabelId = label.id;
  }

  try {
    await provider.removeThreadLabel(threadId, finalLabelId);
    logger.info("Follow-up label removed", { threadId, labelId: finalLabelId });
  } catch (error) {
    logger.warn("Failed to remove follow-up label (may not exist on thread)", {
      threadId,
      error,
    });
  }
}

export async function hasFollowUpLabel({
  provider,
  threadId,
  logger,
}: {
  provider: EmailProvider;
  threadId: string;
  logger: Logger;
}): Promise<boolean> {
  const label = await provider.getLabelByName(FOLLOW_UP_LABEL);
  if (!label) return false;

  try {
    const thread = await provider.getThread(threadId);
    const messages = thread.messages;
    if (!messages?.length) return false;

    return messages.some((message) => message.labelIds?.includes(label.id));
  } catch (error) {
    logger.warn("Failed to check for follow-up label", { threadId, error });
    return false;
  }
}

export async function clearFollowUpLabel({
  emailAccountId,
  threadId,
  provider,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  if (!threadId) return;

  try {
    // No resolved filter: trackers may already be resolved by handleOutboundReply
    // before this function runs, but we still need to delete their drafts.
    const trackersWithDrafts = await prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        threadId,
        followUpDraftId: { not: null },
      },
      select: {
        id: true,
        followUpDraftId: true,
      },
    });

    const deletedDraftTrackerIds: string[] = [];

    for (const tracker of trackersWithDrafts) {
      if (tracker.followUpDraftId) {
        try {
          await provider.deleteDraft(tracker.followUpDraftId);
          deletedDraftTrackerIds.push(tracker.id);
          logger.info("Deleted follow-up draft", {
            trackerId: tracker.id,
          });
        } catch (error) {
          // Keep followUpDraftId so the fallback cleanup can retry
          logger.error("Failed to delete follow-up draft", {
            trackerId: tracker.id,
            error,
          });
        }
      }
    }

    if (deletedDraftTrackerIds.length > 0) {
      await withPrismaRetry(
        () =>
          prisma.threadTracker.updateMany({
            where: {
              id: { in: deletedDraftTrackerIds },
            },
            data: {
              followUpDraftId: null,
            },
          }),
        { logger },
      );
    }

    // Clear followUpAppliedAt only on unresolved trackers (preserve resolved history)
    await withPrismaRetry(
      () =>
        prisma.threadTracker.updateMany({
          where: {
            emailAccountId,
            threadId,
            resolved: false,
            followUpAppliedAt: { not: null },
          },
          data: {
            followUpAppliedAt: null,
          },
        }),
      { logger },
    );

    // Always remove the label regardless of tracker state
    await removeFollowUpLabel({ provider, threadId, logger });
    await replaceFollowUpNotificationsWithReplyReceivedState({
      emailAccountId,
      threadId,
      logger,
    });

    logger.info("Cleared follow-up label and cleaned up trackers", {
      threadId,
      draftsDeleted: deletedDraftTrackerIds.length,
    });
  } catch (error) {
    logger.error("Failed to clear follow-up label", { threadId, error });
    captureException(error, { emailAccountId });
  }
}

type FollowUpNotificationChannelForCleanup = {
  id: string;
  provider: MessagingProvider;
  isConnected: boolean;
  accessToken: string | null;
};

async function replaceFollowUpNotificationsWithReplyReceivedState({
  emailAccountId,
  threadId,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  logger: Logger;
}) {
  try {
    const trackers = await prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        threadId,
        followUpNotifications: { not: Prisma.AnyNull },
      },
      select: {
        id: true,
        followUpNotifications: true,
      },
    });

    const notifications = trackers.flatMap((tracker) =>
      parseFollowUpNotificationDeliveries(tracker.followUpNotifications),
    );
    if (notifications.length === 0) return;

    const messagingChannelIds = [
      ...new Set(
        notifications.map((notification) => notification.messagingChannelId),
      ),
    ];
    const channels = await prisma.messagingChannel.findMany({
      where: {
        id: { in: messagingChannelIds },
        isConnected: true,
      },
      select: {
        id: true,
        provider: true,
        isConnected: true,
        accessToken: true,
      },
    });
    const channelsById = new Map(
      channels.map((channel) => [channel.id, channel]),
    );

    const card = buildReplyReceivedFollowUpCard();
    await Promise.all(
      notifications.map((notification) =>
        replaceFollowUpNotification({
          notification,
          channel: channelsById.get(notification.messagingChannelId),
          card,
          logger,
        }),
      ),
    );

    await prisma.threadTracker.updateMany({
      where: {
        id: { in: trackers.map((tracker) => tracker.id) },
      },
      data: {
        followUpNotifications: Prisma.JsonNull,
      },
    });
  } catch (error) {
    logger.warn("Failed to update follow-up notifications after reply", {
      threadId,
      error,
    });
  }
}

async function replaceFollowUpNotification({
  notification,
  channel,
  card,
  logger,
}: {
  notification: FollowUpNotificationDelivery;
  channel: FollowUpNotificationChannelForCleanup | undefined;
  card: CardElement;
  logger: Logger;
}) {
  if (!channel) return;

  try {
    switch (notification.provider) {
      case MessagingProvider.SLACK: {
        if (!channel.accessToken) return;

        await createSlackClient(channel.accessToken).chat.update(
          disableSlackLinkUnfurls({
            channel: notification.providerThreadId,
            ts: notification.providerMessageId,
            text: cardToFallbackText(card),
            blocks: cardToBlockKit(card),
          }),
        );
        return;
      }
      case MessagingProvider.TEAMS: {
        const teamsAdapter = getMessagingAdapterRegistry().typedAdapters.teams;
        if (!teamsAdapter) return;

        await teamsAdapter.editMessage(
          notification.providerThreadId,
          notification.providerMessageId,
          REPLY_RECEIVED_TEXT,
        );
        return;
      }
      case MessagingProvider.TELEGRAM: {
        const telegramAdapter =
          getMessagingAdapterRegistry().typedAdapters.telegram;
        if (!telegramAdapter) return;

        await telegramAdapter.editMessage(
          notification.providerThreadId,
          notification.providerMessageId,
          REPLY_RECEIVED_TEXT,
        );
        return;
      }
    }
  } catch (error) {
    logger.warn("Failed to update follow-up notification after reply", {
      provider: notification.provider,
      error,
    });
  }
}

const REPLY_RECEIVED_TEXT = "Reply received. Follow-up no longer needed.";

function buildReplyReceivedFollowUpCard() {
  return Card({
    title: "Reply received",
    children: [CardText("Follow-up no longer needed.")],
  });
}
