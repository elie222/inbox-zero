export type MessagingPlatform = "slack" | "teams" | "telegram";
export type MessagingProvider = "SLACK" | "TEAMS" | "TELEGRAM";

const PROVIDER_NAMES: Record<MessagingProvider, string> = {
  SLACK: "Slack",
  TEAMS: "Teams",
  TELEGRAM: "Telegram",
};

export function getMessagingProviderName(
  provider: MessagingProvider | MessagingPlatform,
): string {
  return PROVIDER_NAMES[provider.toUpperCase() as MessagingProvider];
}
