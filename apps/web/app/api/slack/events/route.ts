import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { verifySlackSignature } from "@inboxzero/slack";
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
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (
    Number.isNaN(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 60 * 5
  ) {
    logger.warn("Stale Slack request timestamp", { timestamp });
    return NextResponse.json({ error: "Request too old" }, { status: 401 });
  }

  if (
    !verifySlackSignature(
      env.SLACK_SIGNING_SECRET,
      timestamp,
      rawBody,
      signature,
    )
  ) {
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
