import { NextResponse, after } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import {
  getMessagingChatSdkBot,
  hasMessagingAdapter,
} from "@/utils/messaging/chat-sdk/bot";

export const maxDuration = 120;

export const POST = withError("teams/events", async (request) => {
  if (!env.TEAMS_BOT_APP_ID || !env.TEAMS_BOT_APP_PASSWORD) {
    return NextResponse.json(
      { error: "Teams not configured" },
      { status: 503 },
    );
  }

  if (!hasMessagingAdapter("teams")) {
    return NextResponse.json(
      { error: "Teams adapter unavailable" },
      { status: 503 },
    );
  }

  const { bot } = getMessagingChatSdkBot();
  const handler = bot.webhooks.teams;

  if (!handler) {
    return NextResponse.json(
      { error: "Teams webhook unavailable" },
      { status: 503 },
    );
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  });
});
