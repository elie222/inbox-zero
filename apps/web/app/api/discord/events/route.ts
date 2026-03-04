import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";

export const maxDuration = 120;

export const POST = withError("discord/events", async (request) => {
  return handleMessagingWebhookRoute({
    request,
    platform: "discord",
    isConfigured: Boolean(
      env.DISCORD_BOT_TOKEN && env.DISCORD_APP_ID && env.DISCORD_PUBLIC_KEY,
    ),
    notConfiguredError: "Discord not configured",
    adapterUnavailableError: "Discord adapter unavailable",
    webhookUnavailableError: "Discord webhook unavailable",
  });
});
