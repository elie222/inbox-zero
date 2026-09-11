import { randomUUID } from "node:crypto";
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
} from "./notification-deliveries";

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
  triggerMessageId,
  provider,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  triggerMessageId?: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  if (!threadId) return;

  try {
    // No resolved filter: trackers may already be resolved by handleOutboundReply
    // before this function runs, but we still need to delete their drafts.
    const activeTrackers = await prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        threadId,
        OR: [
          { followUpAppliedAt: { not: null } },
          { followUpDraftId: { not: null } },
          { followUpNotifications: { not: Prisma.AnyNull } },
        ],
      },
      select: {
        id: true,
        messageId: true,
        followUpAppliedAt: true,
        followUpDraftId: true,
        followUpNotifications: true,
        resolved: true,
      },
    });

    if (activeTrackers.length === 0) {
      logger.info("No active follow-up state to clear", { threadId });
      return;
    }

    const triggerMatchesFollowUpTracker = Boolean(
      triggerMessageId &&
        activeTrackers.some(
          (tracker) =>
            tracker.messageId === triggerMessageId && tracker.followUpAppliedAt,
        ),
    );

    logger.info("Loaded follow-up cleanup state", {
      threadId,
      triggerMessageId,
      trackerCount: activeTrackers.length,
      unresolvedFollowUpTrackerCount: activeTrackers.filter(
        (tracker) => !tracker.resolved && tracker.followUpAppliedAt,
      ).length,
      draftTrackerCount: activeTrackers.filter(
        (tracker) => tracker.followUpDraftId,
      ).length,
      notificationTrackerCount: activeTrackers.filter(
        (tracker) => tracker.followUpNotifications,
      ).length,
      triggerMatchesFollowUpTracker,
    });

    if (triggerMatchesFollowUpTracker) {
      logger.info("Skipping follow-up cleanup for tracked message webhook", {
        threadId,
        messageId: triggerMessageId,
      });
      return;
    }

    const trackersWithDrafts = activeTrackers.filter(
      (tracker) => tracker.followUpDraftId !== null,
    );

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

    const activeFollowUpTrackerIds = activeTrackers
      .filter((tracker) => !tracker.resolved && tracker.followUpAppliedAt)
      .map((tracker) => tracker.id);

    if (activeFollowUpTrackerIds.length > 0) {
      logger.info("Resolving follow-up trackers while preserving ledger", {
        threadId,
        trackerCount: activeFollowUpTrackerIds.length,
      });

      await withPrismaRetry(
        () =>
          prisma.threadTracker.updateMany({
            where: {
              id: { in: activeFollowUpTrackerIds },
            },
            data: {
              resolved: true,
            },
          }),
        { logger },
      );
    }

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
      resolvedFollowUpTrackers: activeFollowUpTrackerIds.length,
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

    const claimId = randomUUID();
    const claimedAt = new Date();
    const claimedTrackers: {
      id: string;
      notifications: FollowUpNotificationDelivery[];
    }[] = [];

    for (const tracker of trackers) {
      const notifications = getClaimableFollowUpNotifications(
        tracker.followUpNotifications,
        claimedAt,
      );
      if (notifications.length === 0) continue;

      const claimed = await prisma.threadTracker.updateMany({
        where: {
          id: tracker.id,
          followUpNotifications: {
            equals: tracker.followUpNotifications as Prisma.InputJsonValue,
          },
        },
        data: {
          followUpNotifications: buildFollowUpNotificationCleanupClaim({
            claimId,
            claimedAt,
            notifications,
          }),
        },
      });

      if (claimed.count === 1) {
        claimedTrackers.push({ id: tracker.id, notifications });
      }
    }

    if (claimedTrackers.length === 0) {
      logger.info("Follow-up notification cleanup already claimed", {
        threadId,
      });
      return;
    }

    const notifications = claimedTrackers.flatMap(
      (tracker) => tracker.notifications,
    );
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
    const results = await Promise.all(
      notifications.map((notification) =>
        replaceFollowUpNotification({
          notification,
          channel: channelsById.get(notification.messagingChannelId),
          card,
          logger,
        }),
      ),
    );

    if (!results.every(Boolean)) return;

    await prisma.threadTracker.updateMany({
      where: {
        id: { in: claimedTrackers.map((tracker) => tracker.id) },
        followUpNotifications: {
          path: ["claimId"],
          equals: claimId,
        },
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
}): Promise<boolean> {
  if (!channel) return true;

  try {
    switch (notification.provider) {
      case MessagingProvider.SLACK: {
        if (!channel.accessToken) return true;

        await createSlackClient(channel.accessToken).chat.update(
          disableSlackLinkUnfurls({
            channel: notification.providerThreadId,
            ts: notification.providerMessageId,
            text: cardToFallbackText(card),
            blocks: cardToBlockKit(card),
          }),
        );
        break;
      }
      case MessagingProvider.TEAMS: {
        const teamsAdapter = getMessagingAdapterRegistry().typedAdapters.teams;
        if (!teamsAdapter) return true;

        await teamsAdapter.editMessage(
          notification.providerThreadId,
          notification.providerMessageId,
          REPLY_RECEIVED_TEXT,
        );
        break;
      }
      case MessagingProvider.TELEGRAM: {
        const telegramAdapter =
          getMessagingAdapterRegistry().typedAdapters.telegram;
        if (!telegramAdapter) return true;

        await telegramAdapter.editMessage(
          notification.providerThreadId,
          notification.providerMessageId,
          REPLY_RECEIVED_TEXT,
        );
        break;
      }
    }
    return true;
  } catch (error) {
    logger.warn("Failed to update follow-up notification after reply", {
      provider: notification.provider,
      error,
    });
    return false;
  }
}

const REPLY_RECEIVED_TEXT = "Reply received. Follow-up no longer needed.";
const FOLLOW_UP_NOTIFICATION_CLEANUP_CLAIM_TYPE =
  "reply-received-cleanup-claim";
const FOLLOW_UP_NOTIFICATION_CLEANUP_CLAIM_TTL_MS = 5 * 60 * 1000;

function buildReplyReceivedFollowUpCard() {
  return Card({
    title: "Reply received",
    children: [CardText("Follow-up no longer needed.")],
  });
}

function buildFollowUpNotificationCleanupClaim({
  claimId,
  claimedAt,
  notifications,
}: {
  claimId: string;
  claimedAt: Date;
  notifications: FollowUpNotificationDelivery[];
}): Prisma.InputJsonObject {
  return {
    type: FOLLOW_UP_NOTIFICATION_CLEANUP_CLAIM_TYPE,
    claimId,
    claimedAt: claimedAt.toISOString(),
    notifications,
  };
}

function getClaimableFollowUpNotifications(
  value: unknown,
  now: Date,
): FollowUpNotificationDelivery[] {
  const notifications = parseFollowUpNotificationDeliveries(value);
  if (notifications.length > 0) return notifications;

  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  const claim = value as {
    type?: unknown;
    claimedAt?: unknown;
    notifications?: unknown;
  };
  if (claim.type !== FOLLOW_UP_NOTIFICATION_CLEANUP_CLAIM_TYPE) return [];
  if (typeof claim.claimedAt !== "string") return [];

  const claimedAt = new Date(claim.claimedAt).getTime();
  if (!Number.isFinite(claimedAt)) return [];
  if (now.getTime() - claimedAt < FOLLOW_UP_NOTIFICATION_CLEANUP_CLAIM_TTL_MS) {
    return [];
  }

  return parseFollowUpNotificationDeliveries(claim.notifications);
}
