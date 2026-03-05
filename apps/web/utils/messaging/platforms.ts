export type MessagingPlatform = "slack" | "teams" | "telegram";
export type MessagingProvider = "SLACK" | "TEAMS" | "TELEGRAM";

const PROVIDER_NAMES: Record<MessagingProvider, string> = {
  SLACK: "Slack",
  TEAMS: "Teams",
  TELEGRAM: "Telegram",
};

export function getMessagingProviderName(provider: MessagingProvider): string {
  return PROVIDER_NAMES[provider];
}

export function getMessagingPlatformName(platform: MessagingPlatform): string {
  return PROVIDER_NAMES[platform.toUpperCase() as MessagingProvider];
}
