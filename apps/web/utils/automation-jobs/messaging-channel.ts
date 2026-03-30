import { MessagingProvider } from "@/generated/prisma/enums";

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
  providerUserId: string | null;
  channelId: string | null;
};

export function isSupportedAutomationMessagingProvider(
  provider: MessagingProvider,
) {
  return SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS.includes(provider);
}

export function hasAutomationMessagingDestination(
  channel: Pick<
    AutomationMessagingChannel,
    "provider" | "providerUserId" | "channelId"
  >,
) {
  if (channel.provider === MessagingProvider.SLACK) {
    return Boolean(channel.providerUserId || channel.channelId);
  }

  return Boolean(channel.providerUserId);
}

export function isAutomationMessagingChannelReady(
  channel: AutomationMessagingChannel,
) {
  if (!channel.isConnected) return false;
  if (!isSupportedAutomationMessagingProvider(channel.provider)) return false;
  if (!hasAutomationMessagingDestination(channel)) return false;

  if (channel.provider === MessagingProvider.SLACK && !channel.accessToken) {
    return false;
  }

  return true;
}
