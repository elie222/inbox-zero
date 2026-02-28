import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import {
  ensureSlackTeamInstallation,
  extractSlackTeamIdFromWebhook,
  getMessagingChatSdkBot,
} from "@/utils/messaging/chat-sdk/bot";

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

  const teamId = extractSlackTeamIdFromWebhook(rawBody, contentType);
  if (teamId) {
    await ensureSlackTeamInstallation(teamId, logger);
  }

  const { bot } = getMessagingChatSdkBot();

  const webhookRequest = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: rawBody,
  });

  return bot.webhooks.slack(webhookRequest, {
    waitUntil: (task) => after(() => task),
  });
});
