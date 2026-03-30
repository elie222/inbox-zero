import { MessagingProvider } from "@/generated/prisma/enums";
import type { AutomationMessagingChannel } from "@/utils/automation-jobs/messaging-channel";
import {
  AutomationJobConfigurationError,
  sendAutomationMessageToSlack,
} from "@/utils/automation-jobs/slack";
import type { Logger } from "@/utils/logger";
import { getMessagingChatSdkBot } from "@/utils/messaging/chat-sdk/bot";

export async function sendAutomationMessage({
  channel,
  text,
  logger,
}: {
  channel: Pick<
    AutomationMessagingChannel,
    "provider" | "accessToken" | "botUserId" | "providerUserId" | "channelId"
  >;
  text: string;
  logger: Logger;
}) {
  switch (channel.provider) {
    case MessagingProvider.SLACK: {
      return sendAutomationMessageToSlack({
        channel,
        text,
        logger,
      });
    }
    case MessagingProvider.TEAMS: {
      return sendAutomationMessageToTeams({
        providerUserId: channel.providerUserId,
        text,
        logger,
      });
    }
    case MessagingProvider.TELEGRAM: {
      return sendAutomationMessageToTelegram({
        providerUserId: channel.providerUserId,
        text,
        logger,
      });
    }
    default: {
      throw new AutomationJobConfigurationError(
        "Unsupported messaging provider for automation job",
      );
    }
  }
}

async function sendAutomationMessageToTeams({
  providerUserId,
  text,
  logger,
}: {
  providerUserId: string | null;
  text: string;
  logger: Logger;
}) {
  if (!providerUserId) {
    throw new AutomationJobConfigurationError(
      "Teams channel is missing provider user ID",
    );
  }

  let teamsAdapter: ReturnType<
    typeof getMessagingChatSdkBot
  >["adapters"]["teams"];
  try {
    teamsAdapter = getMessagingChatSdkBot().adapters.teams;
  } catch {
    throw new AutomationJobConfigurationError(
      "Teams adapter is not configured",
    );
  }

  if (!teamsAdapter) {
    throw new AutomationJobConfigurationError(
      "Teams adapter is not configured",
    );
  }

  const teamsLogger = logger.with({
    component: "sendAutomationMessageToTeams",
    destination: providerUserId,
  });

  teamsLogger.info("Sending Teams automation message");

  const threadId = await teamsAdapter.openDM(providerUserId);
  const response = await teamsAdapter.postMessage(threadId, text);

  teamsLogger.info("Teams automation message sent");

  return {
    channelId: threadId,
    messageId: response.id ?? null,
  };
}

async function sendAutomationMessageToTelegram({
  providerUserId,
  text,
  logger,
}: {
  providerUserId: string | null;
  text: string;
  logger: Logger;
}) {
  if (!providerUserId) {
    throw new AutomationJobConfigurationError(
      "Telegram channel is missing provider user ID",
    );
  }

  let telegramAdapter: ReturnType<
    typeof getMessagingChatSdkBot
  >["adapters"]["telegram"];
  try {
    telegramAdapter = getMessagingChatSdkBot().adapters.telegram;
  } catch {
    throw new AutomationJobConfigurationError(
      "Telegram adapter is not configured",
    );
  }

  if (!telegramAdapter) {
    throw new AutomationJobConfigurationError(
      "Telegram adapter is not configured",
    );
  }

  const telegramLogger = logger.with({
    component: "sendAutomationMessageToTelegram",
    destination: providerUserId,
  });

  telegramLogger.info("Sending Telegram automation message");

  const threadId = await telegramAdapter.openDM(providerUserId);
  const response = await telegramAdapter.postMessage(threadId, text);

  telegramLogger.info("Telegram automation message sent");

  return {
    channelId: threadId,
    messageId: response.id ?? null,
  };
}
