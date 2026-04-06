import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import { hasMessagingRoute } from "@/utils/messaging/routes";

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
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetId: string;
  }>;
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
  if (
    !hasMessagingRoute(channel.routes, MessagingRoutePurpose.RULE_NOTIFICATIONS)
  ) {
    return false;
  }

  if (channel.provider === MessagingProvider.SLACK && !channel.accessToken) {
    return false;
  }

  return true;
}
