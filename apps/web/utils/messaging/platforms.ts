export type MessagingPlatform = "slack" | "teams" | "telegram";

export function getMessagingPlatformName(platform: MessagingPlatform): string {
  if (platform === "slack") return "Slack";
  if (platform === "teams") return "Teams";
  return "Telegram";
}
