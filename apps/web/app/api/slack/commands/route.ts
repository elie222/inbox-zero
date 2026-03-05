import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { getHelpText } from "@/utils/messaging/prompt-commands";
import { processSlackSlashCommand } from "@/utils/messaging/providers/slack/slash-commands";
import { validateSlackWebhookRequest } from "@/utils/messaging/providers/slack/verify-signature";

export const maxDuration = 120;

export const POST = withError("slack/commands", async (request) => {
  const logger = request.logger;

  if (!env.SLACK_SIGNING_SECRET) {
    return NextResponse.json(
      { error: "Slack not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const signatureValidation = validateSlackWebhookRequest({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp,
    body: rawBody,
    signature,
  });

  if (!signatureValidation.valid) {
    if (signatureValidation.reason === "stale_timestamp") {
      logger.warn("Stale Slack slash command request timestamp", { timestamp });
      return NextResponse.json({ error: "Request too old" }, { status: 401 });
    }

    logger.warn("Invalid Slack slash command signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get("command") ?? "";
  const userId = params.get("user_id") ?? "";
  const teamId = params.get("team_id") ?? "";
  const responseUrl = params.get("response_url") ?? "";

  if (!command || !userId || !teamId || !responseUrl) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (command.replace(/^\//, "") === "help") {
    return NextResponse.json({
      response_type: "ephemeral",
      text: getHelpText("slack"),
    });
  }

  after(async () => {
    await processSlackSlashCommand({
      command,
      userId,
      teamId,
      responseUrl,
      logger,
    });
  });

  return NextResponse.json({
    response_type: "ephemeral",
    text: "Working on it...",
  });
});
