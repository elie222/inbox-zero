import { createSlackAdapter, type SlackAdapter } from "@chat-adapter/slack";
import { createTeamsAdapter, type TeamsAdapter } from "@chat-adapter/teams";
import {
  createTelegramAdapter,
  type TelegramAdapter,
} from "@chat-adapter/telegram";
import type { Adapter } from "chat";
import { env } from "@/env";

export type MessagingAdapters = {
  slack?: SlackAdapter;
  teams?: TeamsAdapter;
  telegram?: TelegramAdapter;
};

type MessagingAdapterRegistry = {
  adapters: Record<string, Adapter>;
  typedAdapters: MessagingAdapters;
};

declare global {
  var inboxZeroMessagingAdapterRegistry: MessagingAdapterRegistry | undefined;
}

export function getMessagingAdapterRegistry(): MessagingAdapterRegistry {
  if (!global.inboxZeroMessagingAdapterRegistry) {
    global.inboxZeroMessagingAdapterRegistry = createMessagingAdapterRegistry();
  }

  return global.inboxZeroMessagingAdapterRegistry;
}

function createMessagingAdapterRegistry(): MessagingAdapterRegistry {
  const adapters: Record<string, Adapter> = {};
  const typedAdapters: MessagingAdapters = {};

  if (env.SLACK_SIGNING_SECRET) {
    const slackAdapterConfig: Parameters<typeof createSlackAdapter>[0] = {
      signingSecret: env.SLACK_SIGNING_SECRET,
    };

    if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) {
      slackAdapterConfig.clientId = env.SLACK_CLIENT_ID;
      slackAdapterConfig.clientSecret = env.SLACK_CLIENT_SECRET;
    }

    const slackAdapter = createSlackAdapter(slackAdapterConfig);
    adapters.slack = slackAdapter;
    typedAdapters.slack = slackAdapter;
  }

  if (env.TEAMS_BOT_APP_ID && env.TEAMS_BOT_APP_PASSWORD) {
    const teamsAdapter = createTeamsAdapter({
      appId: env.TEAMS_BOT_APP_ID,
      appPassword: env.TEAMS_BOT_APP_PASSWORD,
      appTenantId: env.TEAMS_BOT_APP_TENANT_ID,
      ...(env.TEAMS_BOT_APP_TYPE ? { appType: env.TEAMS_BOT_APP_TYPE } : {}),
    });

    adapters.teams = teamsAdapter;
    typedAdapters.teams = teamsAdapter;
  }

  if (env.TELEGRAM_BOT_TOKEN) {
    const telegramAdapter = createTelegramAdapter({
      botToken: env.TELEGRAM_BOT_TOKEN,
      secretToken: env.TELEGRAM_BOT_SECRET_TOKEN,
    });

    adapters.telegram = telegramAdapter;
    typedAdapters.telegram = telegramAdapter;
  }

  if (!Object.keys(adapters).length) {
    throw new Error(
      "No messaging adapters configured. Configure Slack, Teams, or Telegram credentials.",
    );
  }

  return { adapters, typedAdapters };
}
