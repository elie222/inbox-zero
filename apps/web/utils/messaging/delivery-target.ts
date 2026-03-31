import type { Prisma } from "@/generated/prisma/client";
import { MessagingProvider } from "@/generated/prisma/enums";

export function hasMessagingDeliveryTarget(channel: {
  provider: MessagingProvider;
  providerUserId: string | null;
  channelId: string | null;
  teamId?: string | null;
}) {
  if (channel.provider === MessagingProvider.SLACK) {
    return Boolean(channel.channelId);
  }

  if (channel.provider === MessagingProvider.TELEGRAM) {
    return Boolean(channel.teamId || channel.providerUserId);
  }

  return Boolean(channel.providerUserId);
}

export function getMessagingDeliveryTargetWhere(): Prisma.MessagingChannelWhereInput {
  return {
    OR: [
      {
        provider: MessagingProvider.SLACK,
        channelId: { not: null },
      },
      {
        provider: MessagingProvider.TEAMS,
        providerUserId: { not: null },
      },
      {
        provider: MessagingProvider.TELEGRAM,
        OR: [{ teamId: { not: "" } }, { providerUserId: { not: null } }],
      },
    ],
  };
}
