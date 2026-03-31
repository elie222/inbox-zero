import { MessagingProvider } from "@/generated/prisma/enums";

export function hasMessagingDeliveryTarget(channel: {
  provider: MessagingProvider;
  providerUserId: string | null;
  channelId: string | null;
}) {
  if (channel.provider === MessagingProvider.SLACK) {
    return Boolean(channel.channelId);
  }

  return Boolean(channel.providerUserId);
}
