import { NextResponse } from "next/server";
import { env } from "@/env";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import {
  handleBotStatusChange,
  handleTranscriptReady,
} from "@/utils/meeting-recorder/webhook-handlers";
import { withError } from "@/utils/middleware";
import { getFailureReason, recallCodeToStatus } from "@/utils/recall/status";
import {
  recallWebhookPayloadSchema,
  type RecallWebhookPayload,
} from "@/utils/recall/types";
import { verifyRecallWebhook } from "@/utils/recall/verify-webhook";

const BOT_PROVIDER = "recall";

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

  const parsed = recallWebhookPayloadSchema.safeParse(JSON.parse(rawBody));
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
  const externalBotId = payload.data.bot?.id;
  if (!externalBotId) {
    logger.warn("Ignored Recall webhook without a bot id", {
      event: payload.event,
    });
    return;
  }

  const eventLogger = logger.with({ externalBotId, event: payload.event });

  if (payload.event === "transcript.done") {
    const externalTranscriptId = payload.data.transcript?.id;
    if (!externalTranscriptId) {
      eventLogger.warn("Ignored transcript event without a transcript id");
      return;
    }

    await handleTranscriptReady({
      botProvider: BOT_PROVIDER,
      externalBotId,
      externalTranscriptId,
      logger: eventLogger,
    });
    return;
  }

  // Recall sends the lifecycle code in the payload, but the event name carries
  // the same information (`bot.done`, `bot.fatal`) as a fallback.
  const code = payload.data.data?.code ?? payload.event.split(".").at(-1);
  const status = code ? recallCodeToStatus(code) : null;
  if (!status) {
    eventLogger.info("Ignored unmapped Recall status code", { code });
    return;
  }

  await handleBotStatusChange({
    botProvider: BOT_PROVIDER,
    externalBotId,
    status,
    failureReason:
      status === MeetingRecordingStatus.FAILED
        ? getFailureReason(payload.data.data?.sub_code)
        : undefined,
    logger: eventLogger,
  });
}
