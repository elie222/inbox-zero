import { withError } from "@/utils/middleware";
import { isTeamsBotConfigured } from "@/utils/messaging/chat-sdk/teams-config";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";

export const maxDuration = 120;

export const POST = withError("teams/events", async (request) =>
  handleMessagingWebhookRoute({
    request,
    platform: "teams",
    isConfigured: isTeamsBotConfigured(),
    notConfiguredError: "Teams not configured",
    adapterUnavailableError: "Teams adapter unavailable",
    webhookUnavailableError: "Teams webhook unavailable",
  }),
);
