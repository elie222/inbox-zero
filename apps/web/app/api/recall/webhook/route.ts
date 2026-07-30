import { NextResponse } from "next/server";
import { env } from "@/env";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import {
  handleBotStatusChange,
  handleRecordingReady,
  handleTranscriptReady,
} from "@/utils/meeting-recorder/webhook-handlers";
import { withError } from "@/utils/middleware";
import { RECALL_BOT_PROVIDER } from "@/utils/recall/client";
import { interpretRecallWebhook } from "@/utils/recall/status";
import {
  recallWebhookPayloadSchema,
  type RecallWebhookPayload,
} from "@/utils/recall/types";
import { verifyRecallWebhook } from "@/utils/recall/verify-webhook";

export const POST = withError("recall/webhook", async (request) => {
  const logger = request.logger;

  if (!env.RECALL_WEBHOOK_SECRET) {
    logger.error("Received a Recall webhook but no secret is configured");
    return new Response("Not configured", { status: 503 });
  }

  const rawBody = await request.text();

  const verified = verifyRecallWebhook({
    secret: env.RECALL_WEBHOOK_SECRET,
    headers: request.headers,
    rawBody,
  });
  if (!verified) {
    logger.warn("Rejected Recall webhook with an invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const parsed = recallWebhookPayloadSchema.safeParse(safeJsonParse(rawBody));
  if (!parsed.success) {
    logger.warn("Ignored malformed Recall webhook", {
      errors: parsed.error.issues,
    });
    return NextResponse.json({ ok: true });
  }

  // A payload we cannot act on is acknowledged inside the handler, because it
  // will not become actionable on a retry. An unexpected failure here is a
  // different thing: a database or queue blip would lose the event for good, so
  // answer non-2xx and let the provider redeliver.
  try {
    await processRecallEvent(parsed.data, logger);
  } catch (error) {
    logger.error("Failed to process Recall webhook", {
      event: parsed.data.event,
      error,
    });
    captureException(error);
    return new Response("Processing failed", { status: 500 });
  }

  return NextResponse.json({ ok: true });
});

async function processRecallEvent(
  payload: RecallWebhookPayload,
  logger: Logger,
): Promise<void> {
  const interpretation = interpretRecallWebhook(payload);
  const eventLogger = logger.with({
    event: payload.event,
    ...(payload.data.bot?.id && { externalBotId: payload.data.bot.id }),
  });

  if (interpretation.type === "ignore") {
    eventLogger.info("Ignored Recall webhook", {
      reason: interpretation.reason,
    });
    return;
  }

  switch (interpretation.type) {
    case "transcriptReady":
      await handleTranscriptReady({
        botProvider: RECALL_BOT_PROVIDER,
        externalBotId: interpretation.externalBotId,
        externalTranscriptId: interpretation.externalTranscriptId,
        logger: eventLogger,
      });
      return;

    case "recordingReady":
      await handleRecordingReady({
        botProvider: RECALL_BOT_PROVIDER,
        externalBotId: interpretation.externalBotId,
        externalRecordingId: interpretation.externalRecordingId,
        logger: eventLogger,
      });
      return;

    case "statusChange":
      await handleBotStatusChange({
        botProvider: RECALL_BOT_PROVIDER,
        externalBotId: interpretation.externalBotId,
        status: interpretation.status,
        fromStatuses: interpretation.fromStatuses,
        failureReason: interpretation.failureReason,
        logger: eventLogger,
      });
      return;
  }
}

// A signed but malformed body is still malformed on redelivery, so it has to
// reach the acknowledge-and-drop path rather than throwing into the 500 branch.
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
