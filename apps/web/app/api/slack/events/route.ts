import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { verifySlackSignature } from "@inboxzero/slack";
import { processSlackEvent } from "@/utils/slack/process-slack-event";

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
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  // Reject requests older than 5 minutes to prevent replay attacks
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

  const body = JSON.parse(rawBody);

  // Handle Slack URL verification challenge
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === "event_callback") {
    // Skip retries - Slack resends if we don't respond in 3s
    const retryNum = request.headers.get("x-slack-retry-num");
    if (retryNum) {
      logger.info("Skipping Slack retry", { retryNum });
      return NextResponse.json({ ok: true });
    }

    after(async () => {
      try {
        await processSlackEvent(body, logger);
      } catch (error) {
        logger.error("Error processing Slack event", { error });
      }
    });
  }

  return NextResponse.json({ ok: true });
});
