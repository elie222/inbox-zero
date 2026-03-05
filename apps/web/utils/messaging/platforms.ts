export type MessagingPlatform = "slack" | "teams" | "telegram" | "discord";

export function getMessagingPlatformName(platform: MessagingPlatform): string {
  if (platform === "slack") return "Slack";
  if (platform === "teams") return "Teams";
  if (platform === "discord") return "Discord";
  return "Telegram";
}
