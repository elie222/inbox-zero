import { SafeError } from "@/utils/error";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import {
  getChannelInfo,
  listPrivateChannelsForUser,
} from "./providers/slack/channels";
import { createSlackClient } from "./providers/slack/client";
import { sendChannelConfirmation } from "./providers/slack/send";
import type { Logger } from "@/utils/logger";

export async function upsertSlackRoute({
  messagingChannelId,
  purpose,
  targetId,
  accessToken,
  providerUserId,
  botUserId,
  logger,
}: {
  messagingChannelId: string;
  purpose: MessagingRoutePurpose;
  targetId: string;
  accessToken: string;
  providerUserId: string | null;
  botUserId: string | null;
  logger: Logger;
}) {
  const target = await resolveSlackRouteTarget({
    accessToken,
    providerUserId,
    targetId,
    logger,
  });

  await prisma.messagingRoute.upsert({
    where: {
      messagingChannelId_purpose: {
        messagingChannelId,
        purpose,
      },
    },
    update: target,
    create: {
      messagingChannelId,
      purpose,
      ...target,
    },
  });

  if (
    (purpose === MessagingRoutePurpose.RULE_NOTIFICATIONS ||
      purpose === MessagingRoutePurpose.SCHEDULED_CHECK_INS) &&
    target.targetType === MessagingRouteTargetType.CHANNEL
  ) {
    try {
      await sendChannelConfirmation({
        accessToken,
        channelId: target.targetId,
        botUserId,
      });
    } catch (error) {
      logger.error("Failed to send channel confirmation", { error });
    }
  }
}

export async function resolveSlackRouteTarget({
  accessToken,
  providerUserId,
  targetId,
  logger,
}: {
  accessToken: string;
  providerUserId: string | null;
  targetId: string;
  logger: Logger;
}) {
  if (targetId === "dm") {
    logger.trace("Resolving Slack direct-message target", {
      hasProviderUserId: Boolean(providerUserId),
    });

    if (!providerUserId) {
      logger.error("Slack direct-message target is unavailable");
      throw new SafeError("Direct messages are not available for this channel");
    }

    return {
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId: providerUserId,
    };
  }

  const client = createSlackClient(accessToken);
  logger.trace("Resolving Slack channel target", { targetId });

  let channelInfo: Awaited<ReturnType<typeof getChannelInfo>> = null;
  try {
    channelInfo = await getChannelInfo(client, targetId);
  } catch (error) {
    logger.error("Failed to resolve Slack channel target", { error, targetId });
    throw error;
  }

  if (!channelInfo) {
    logger.error("Slack channel target not found", { targetId });
    throw new SafeError("Could not find the selected Slack channel");
  }

  if (!channelInfo.isPrivate) {
    logger.error("Slack channel target is not private", { targetId });
    throw new SafeError(
      "Only private channels are allowed. Please select a private channel.",
    );
  }

  if (!providerUserId) {
    logger.error("Slack channel target cannot be validated without user id", {
      targetId,
    });
    throw new SafeError(
      "Please reconnect Slack before selecting a private channel.",
    );
  }

  const availablePrivateChannels = await listPrivateChannelsForUser(
    client,
    providerUserId,
  );
  const isAvailableToUser = availablePrivateChannels.some(
    (channel) => channel.id === targetId,
  );

  if (!isAvailableToUser) {
    logger.error("Slack channel target is unavailable to user", {
      targetId,
    });
    throw new SafeError(
      "Only private channels you are a member of are allowed. Please select one of your private channels.",
    );
  }

  return {
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId,
  };
}
