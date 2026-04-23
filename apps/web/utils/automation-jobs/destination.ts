import {
  MessagingRoutePurpose,
  type MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getMessagingRoute } from "@/utils/messaging/routes";

export type AutomationMessagingRoute = {
  purpose: MessagingRoutePurpose;
  targetType: MessagingRouteTargetType;
  targetId: string;
};

export async function ensureScheduledCheckInsRoute({
  messagingChannelId,
  routes,
}: {
  messagingChannelId: string;
  routes: AutomationMessagingRoute[];
}) {
  const existingRoute = getMessagingRoute(
    routes,
    MessagingRoutePurpose.SCHEDULED_CHECK_INS,
  );
  if (existingRoute) return existingRoute;

  const sourceRoute = getMessagingRoute(
    routes,
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
  );
  if (!sourceRoute) return null;

  try {
    await prisma.messagingRoute.create({
      data: {
        messagingChannelId,
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: sourceRoute.targetType,
        targetId: sourceRoute.targetId,
      },
    });
  } catch (error) {
    if (!isDuplicateError(error, "messagingChannelId")) throw error;
  }

  return {
    purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
    targetType: sourceRoute.targetType,
    targetId: sourceRoute.targetId,
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
    messagingChannelId: channel.id,
    routes: channel.routes,
  });
}
