import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import {
  ensureSlackTeamInstallation,
  extractSlackTeamIdFromWebhook,
  getMessagingChatSdkBot,
  withMessagingRequestLogger,
} from "@/utils/messaging/chat-sdk/bot";
import { validateSlackWebhookRequest } from "@/utils/messaging/providers/slack/verify-signature";
import { publishAppHome } from "@/utils/messaging/providers/slack/app-home";
import { handleSlackAppUninstalled } from "@/utils/messaging/providers/slack/uninstall";

export const maxDuration = 120;

export const POST = withError("slack/events", async (request) => {
  const logger = request.logger;

  if (!env.SLACK_SIGNING_SECRET) {
    return NextResponse.json(
      { error: "Slack not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const contentType = request.headers.get("content-type") ?? "";
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  // Validate before installation seeding so invalid requests cannot trigger DB/Redis work.
  // The Slack adapter also validates internally when handling the webhook.
  const signatureValidation = validateSlackWebhookRequest({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp,
    body: rawBody,
    signature,
  });

  if (!signatureValidation.valid) {
    if (signatureValidation.reason === "stale_timestamp") {
      logger.warn("Stale Slack request timestamp", { timestamp });
      return NextResponse.json({ error: "Request too old" }, { status: 401 });
    }

    logger.warn("Invalid Slack signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const teamId = extractSlackTeamIdFromWebhook(rawBody, contentType);
  if (teamId) {
    try {
      await ensureSlackTeamInstallation(teamId, logger);
    } catch (error) {
      logger.warn("Failed to seed Slack installation for Chat SDK", {
        teamId,
        error,
      });
    }
  }

  const slackEvent = parseSlackEventType(rawBody);

  if (slackEvent?.type === "app_home_opened" && slackEvent.tab === "home") {
    after(async () => {
      try {
        await publishAppHome({
          teamId: slackEvent.teamId,
          userId: slackEvent.userId,
          logger,
        });
      } catch (error) {
        logger.warn("Failed to publish App Home", { error });
      }
    });
    return NextResponse.json({ ok: true });
  }

  if (
    slackEvent?.type === "app_uninstalled" ||
    slackEvent?.type === "tokens_revoked"
  ) {
    after(async () => {
      try {
        await handleSlackAppUninstalled({
          teamId: slackEvent.teamId,
          logger,
        });
      } catch (error) {
        logger.warn("Failed to handle Slack app uninstall", { error });
      }
    });
    return NextResponse.json({ ok: true });
  }

  const { bot } = getMessagingChatSdkBot();

  const webhookRequest = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: rawBody,
  });

  return withMessagingRequestLogger({
    logger,
    fn: () =>
      bot.webhooks.slack(webhookRequest, {
        waitUntil: (task) => after(() => task),
      }),
  });
});

function parseSlackEventType(
  rawBody: string,
): { type: string; teamId: string; userId: string; tab?: string } | null {
  try {
    const parsed = JSON.parse(rawBody) as {
      event?: { type?: string; user?: string; tab?: string };
      team_id?: string;
      authorizations?: Array<{ team_id?: string }>;
    };

    const eventType = parsed.event?.type;
    if (!eventType) return null;

    const teamId = parsed.team_id ?? parsed.authorizations?.[0]?.team_id ?? "";
    const userId = parsed.event?.user ?? "";

    const tab = parsed.event?.tab;

    return { type: eventType, teamId, userId, tab };
  } catch {
    return null;
  }
}
