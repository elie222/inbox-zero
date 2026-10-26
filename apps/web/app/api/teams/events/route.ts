import { withError } from "@/utils/middleware";
import { isTeamsBotConfigured } from "@/utils/messaging/chat-sdk/teams-config";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";
import { sendTeamsInstallationWelcome } from "@/utils/messaging/providers/teams/welcome";

export const maxDuration = 120;

export const POST = withError("teams/events", async (request) => {
  const activityRequest = request.clone();
  const response = await handleMessagingWebhookRoute({
    request,
    platform: "teams",
    isConfigured: isTeamsBotConfigured(),
    notConfiguredError: "Teams not configured",
    adapterUnavailableError: "Teams adapter unavailable",
    webhookUnavailableError: "Teams webhook unavailable",
  });

  if (response.ok) {
    const activity = await activityRequest.json().catch(() => null);
    await sendTeamsInstallationWelcome(activity);
  }

  return response;
});
