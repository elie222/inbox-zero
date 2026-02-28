import { NextResponse, after } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import {
  getMessagingChatSdkBot,
  hasMessagingAdapter,
} from "@/utils/messaging/chat-sdk/bot";

export const maxDuration = 120;

export const POST = withError("telegram/events", async (request) => {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: "Telegram not configured" },
      { status: 503 },
    );
  }

  if (!hasMessagingAdapter("telegram")) {
    return NextResponse.json(
      { error: "Telegram adapter unavailable" },
      { status: 503 },
    );
  }

  const { bot } = getMessagingChatSdkBot();
  const handler = bot.webhooks.telegram;

  if (!handler) {
    return NextResponse.json(
      { error: "Telegram webhook unavailable" },
      { status: 503 },
    );
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  });
});
