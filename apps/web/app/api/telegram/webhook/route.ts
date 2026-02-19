import { after, NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { processTelegramEvent } from "@/utils/telegram/process-telegram-event";
import { verifyTelegramWebhookToken } from "@inboxzero/telegram";

export const maxDuration = 120;

export const POST = withError("telegram/webhook", async (request) => {
  const logger = request.logger;

  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Telegram not configured" },
      { status: 503 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const botId = searchParams.get("bot_id");

  if (!botId || !/^\d+$/.test(botId)) {
    return NextResponse.json(
      { error: "Missing or invalid bot ID" },
      { status: 400 },
    );
  }

  const secretTokenHeader = request.headers.get(
    "x-telegram-bot-api-secret-token",
  );

  if (
    !verifyTelegramWebhookToken(env.TELEGRAM_WEBHOOK_SECRET, secretTokenHeader)
  ) {
    logger.warn("Invalid Telegram webhook token");
    return NextResponse.json(
      { error: "Invalid webhook token" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      await processTelegramEvent(
        body as Parameters<typeof processTelegramEvent>[0],
        botId,
        logger,
      );
    } catch (error) {
      logger.error("Error processing Telegram event", { error });
    }
  });

  return NextResponse.json({ ok: true });
});
