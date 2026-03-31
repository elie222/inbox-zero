import { env } from "@/env";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";

export const maxDuration = 120;

export const POST = withError("telegram/events", async (request) => {
  if (!env.TELEGRAM_BOT_SECRET_TOKEN) {
    return NextResponse.json(
      { error: "Telegram webhook secret token not configured" },
      { status: 503 },
    );
  }

  return handleMessagingWebhookRoute({
    request,
    platform: "telegram",
    isConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
    notConfiguredError: "Telegram not configured",
    adapterUnavailableError: "Telegram adapter unavailable",
    webhookUnavailableError: "Telegram webhook unavailable",
  });
});
