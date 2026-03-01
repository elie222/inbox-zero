import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";

export const maxDuration = 120;

export const POST = withError("telegram/events", async (request) => {
  return handleMessagingWebhookRoute({
    request,
    platform: "telegram",
    isConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
    notConfiguredError: "Telegram not configured",
    adapterUnavailableError: "Telegram adapter unavailable",
    webhookUnavailableError: "Telegram webhook unavailable",
  });
});
