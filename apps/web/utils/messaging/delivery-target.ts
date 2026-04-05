import type { Prisma } from "@/generated/prisma/client";
import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import { hasMessagingRoute } from "@/utils/messaging/routes";

type LegacyChannelTarget = {
  provider: MessagingProvider;
  providerUserId: string | null;
  channelId: string | null;
  teamId?: string | null;
};

type RouteBackedChannelTarget = {
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetId: string;
  }>;
};

export function hasMessagingDeliveryTarget(
  channel: LegacyChannelTarget | RouteBackedChannelTarget,
  purpose: MessagingRoutePurpose = MessagingRoutePurpose.RULE_NOTIFICATIONS,
) {
  if ("routes" in channel) {
    return hasMessagingRoute(channel.routes, purpose);
  }

  if (channel.provider === MessagingProvider.SLACK) {
    return Boolean(channel.channelId);
  }

  if (channel.provider === MessagingProvider.TELEGRAM) {
    return Boolean(channel.teamId || channel.providerUserId);
  }

  return Boolean(channel.providerUserId);
}

export function getMessagingDeliveryTargetWhere(
  purpose: MessagingRoutePurpose = MessagingRoutePurpose.RULE_NOTIFICATIONS,
): Prisma.MessagingChannelWhereInput {
  return {
    routes: {
      some: {
        purpose,
      },
    },
  };
}
