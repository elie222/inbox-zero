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

export function formatAutomationMessagingChannelLabel(
  channel: Pick<AutomationMessagingChannel, "provider" | "channelId"> & {
    channelName: string | null;
    teamName: string | null;
  },
  options?: { includeTeamNameWithChannel?: boolean },
) {
  if (
    options?.includeTeamNameWithChannel &&
    channel.channelName &&
    channel.teamName
  ) {
    return `#${channel.channelName} (${channel.teamName})`;
  }

  if (channel.channelName) return `#${channel.channelName}`;
  if (channel.channelId && channel.provider !== MessagingProvider.SLACK) {
    return `Channel ${channel.channelId}`;
  }
  if (channel.teamName) return channel.teamName;

  if (channel.provider === MessagingProvider.TEAMS) return "Teams destination";
  if (channel.provider === MessagingProvider.TELEGRAM)
    return "Telegram destination";

  return "Slack workspace";
}
