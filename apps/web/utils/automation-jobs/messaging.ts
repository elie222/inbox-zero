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
    "provider" | "accessToken" | "providerUserId" | "channelId"
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
  return sendAutomationMessageToDirectAdapter({
    providerUserId,
    text,
    logger,
    component: "sendAutomationMessageToTeams",
    invalidDestinationError: "Teams channel is missing provider user ID",
    adapterNotConfiguredError: "Teams adapter is not configured",
    sendingLog: "Sending Teams automation message",
    sentLog: "Teams automation message sent",
    getAdapter: () => getMessagingChatSdkBot().adapters.teams,
  });
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
  return sendAutomationMessageToDirectAdapter({
    providerUserId,
    text,
    logger,
    component: "sendAutomationMessageToTelegram",
    invalidDestinationError: "Telegram channel is missing provider user ID",
    adapterNotConfiguredError: "Telegram adapter is not configured",
    sendingLog: "Sending Telegram automation message",
    sentLog: "Telegram automation message sent",
    getAdapter: () => getMessagingChatSdkBot().adapters.telegram,
  });
}

type DirectMessageAdapter = {
  openDM: (destination: string) => Promise<string>;
  postMessage: (
    channelId: string,
    text: string,
  ) => Promise<{ id?: string | null }>;
};

async function sendAutomationMessageToDirectAdapter({
  providerUserId,
  text,
  logger,
  component,
  invalidDestinationError,
  adapterNotConfiguredError,
  sendingLog,
  sentLog,
  getAdapter,
}: {
  providerUserId: string | null;
  text: string;
  logger: Logger;
  component: string;
  invalidDestinationError: string;
  adapterNotConfiguredError: string;
  sendingLog: string;
  sentLog: string;
  getAdapter: () => DirectMessageAdapter | null | undefined;
}) {
  if (!providerUserId) {
    throw new AutomationJobConfigurationError(invalidDestinationError);
  }

  let adapter: DirectMessageAdapter | null | undefined;
  try {
    adapter = getAdapter();
  } catch {
    throw new AutomationJobConfigurationError(adapterNotConfiguredError);
  }

  if (!adapter) {
    throw new AutomationJobConfigurationError(adapterNotConfiguredError);
  }

  const adapterLogger = logger.with({
    component,
    destination: providerUserId,
  });

  adapterLogger.info(sendingLog);

  const threadId = await adapter.openDM(providerUserId);
  const response = await adapter.postMessage(threadId, text);

  adapterLogger.info(sentLog);

  return {
    channelId: threadId,
    messageId: response.id ?? null,
  };
}
