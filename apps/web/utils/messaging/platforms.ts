// Lowercase platforms correspond to the real-time chat-SDK bot integrations.
// Webhook is a one-way delivery provider with no bot platform, so it is
// intentionally not a MessagingPlatform.
export type MessagingPlatform = "slack" | "teams" | "telegram";
export type MessagingProvider = "SLACK" | "TEAMS" | "TELEGRAM" | "WEBHOOK";

const PROVIDER_NAMES: Record<MessagingProvider, string> = {
  SLACK: "Slack",
  TEAMS: "Teams",
  TELEGRAM: "Telegram",
  WEBHOOK: "Webhook",
};

export function getMessagingProviderName(
  provider: MessagingProvider | MessagingPlatform,
): string {
  return PROVIDER_NAMES[provider.toUpperCase() as MessagingProvider];
}

export function getConnectAppLabel(
  providers: ReadonlyArray<MessagingProvider | MessagingPlatform>,
): string {
  const names = providers.map(getMessagingProviderName);
  if (names.length === 0) return "Connect app";
  if (names.length === 1) return `Connect ${names[0]}`;
  if (names.length === 2) return `Connect ${names[0]} or ${names[1]}`;
  return `Connect ${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}
