import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";

export const maxDuration = 120;

export const POST = withError("teams/events", async (request) => {
  return handleMessagingWebhookRoute({
    request,
    platform: "teams",
    isConfigured: Boolean(env.TEAMS_BOT_APP_ID && env.TEAMS_BOT_APP_PASSWORD),
    notConfiguredError: "Teams not configured",
    adapterUnavailableError: "Teams adapter unavailable",
    webhookUnavailableError: "Teams webhook unavailable",
  });
});
