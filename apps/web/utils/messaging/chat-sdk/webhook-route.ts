import { NextResponse, after } from "next/server";
import {
  getMessagingChatSdkBot,
  hasMessagingAdapter,
  withMessagingRequestLogger,
} from "@/utils/messaging/chat-sdk/bot";
import type { MessagingPlatform } from "@/utils/messaging/platforms";
import type { Logger } from "@/utils/logger";

type RouteConfig = {
  request: Request & { logger: Logger };
  platform: Exclude<MessagingPlatform, "slack">;
  isConfigured: boolean;
  notConfiguredError: string;
  adapterUnavailableError: string;
  webhookUnavailableError: string;
};

export async function handleMessagingWebhookRoute({
  request,
  platform,
  isConfigured,
  notConfiguredError,
  adapterUnavailableError,
  webhookUnavailableError,
}: RouteConfig) {
  if (!isConfigured) {
    return NextResponse.json({ error: notConfiguredError }, { status: 503 });
  }

  if (!hasMessagingAdapter(platform)) {
    return NextResponse.json(
      { error: adapterUnavailableError },
      { status: 503 },
    );
  }

  const { bot } = getMessagingChatSdkBot();
  const handler = bot.webhooks[platform];

  if (!handler) {
    return NextResponse.json(
      { error: webhookUnavailableError },
      { status: 503 },
    );
  }

  return withMessagingRequestLogger({
    logger: request.logger,
    fn: () =>
      handler(request, {
        waitUntil: (task) => after(() => task),
      }),
  });
}
