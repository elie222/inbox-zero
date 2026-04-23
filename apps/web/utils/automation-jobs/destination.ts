import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getMessagingRoute } from "@/utils/messaging/routes";
import { isMessagingChannelOperational } from "@/utils/messaging/channel-validity";
import { isSupportedAutomationMessagingProvider } from "@/utils/automation-jobs/messaging-channel";

type AutomationMessagingRoute = {
  purpose: MessagingRoutePurpose;
  targetType: MessagingRouteTargetType;
  targetId: string;
};

export async function ensureScheduledCheckInsRoute({
  channel,
  routes,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    isConnected: boolean;
    accessToken: string | null;
    teamId: string;
    providerUserId: string | null;
  };
  routes: AutomationMessagingRoute[];
}) {
  if (!isSupportedAutomationMessagingProvider(channel.provider)) return null;
  if (!isMessagingChannelOperational(channel)) return null;

  const existingRoute = getMessagingRoute(
    routes,
    MessagingRoutePurpose.SCHEDULED_CHECK_INS,
  );
  const targetId = getDirectMessageTargetId(channel);
  if (existingRoute) {
    if (existingRoute.targetType === MessagingRouteTargetType.CHANNEL) {
      return existingRoute;
    }

    if (!targetId) return null;
    if (existingRoute.targetId === targetId) return existingRoute;

    await prisma.messagingRoute.update({
      where: {
        messagingChannelId_purpose: {
          messagingChannelId: channel.id,
          purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        },
      },
      data: {
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId,
      },
    });

    return {
      purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId,
    };
  }

  if (!targetId) return null;

  try {
    await prisma.messagingRoute.create({
      data: {
        messagingChannelId: channel.id,
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId,
      },
    });
  } catch (error) {
    if (!isDuplicateError(error, "messagingChannelId")) throw error;
  }

  return {
    purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
    targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
    targetId,
  };
}

export async function ensureScheduledCheckInsRouteForChannel({
  emailAccountId,
  messagingChannelId,
}: {
  emailAccountId: string;
  messagingChannelId: string;
}) {
  const channel = await prisma.messagingChannel.findUnique({
    where: {
      id_emailAccountId: {
        id: messagingChannelId,
        emailAccountId,
      },
    },
    select: {
      id: true,
      provider: true,
      isConnected: true,
      accessToken: true,
      teamId: true,
      providerUserId: true,
      routes: {
        select: {
          purpose: true,
          targetType: true,
          targetId: true,
        },
      },
    },
  });

  if (!channel) return null;

  return ensureScheduledCheckInsRoute({
    channel,
    routes: channel.routes,
  });
}

function getDirectMessageTargetId(channel: {
  provider: MessagingProvider;
  teamId: string;
  providerUserId: string | null;
}) {
  if (channel.provider === MessagingProvider.TELEGRAM) return channel.teamId;
  return channel.providerUserId;
}
