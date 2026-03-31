import { MessagingProvider } from "@/generated/prisma/enums";
import { hasMessagingDeliveryTarget } from "@/utils/messaging/delivery-target";

export const SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS: MessagingProvider[] = [
  MessagingProvider.SLACK,
  MessagingProvider.TEAMS,
  MessagingProvider.TELEGRAM,
];

export type AutomationMessagingChannel = {
  provider: MessagingProvider;
  isConnected: boolean;
  accessToken: string | null;
  botUserId?: string | null;
  teamId?: string | null;
  providerUserId: string | null;
  channelId: string | null;
};

export function isSupportedAutomationMessagingProvider(
  provider: MessagingProvider,
) {
  return SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS.includes(provider);
}

export function isAutomationMessagingChannelReady(
  channel: AutomationMessagingChannel,
) {
  if (!channel.isConnected) return false;
  if (!isSupportedAutomationMessagingProvider(channel.provider)) return false;
  if (!hasMessagingDeliveryTarget(channel)) return false;

  if (channel.provider === MessagingProvider.SLACK && !channel.accessToken) {
    return false;
  }

  return true;
}
