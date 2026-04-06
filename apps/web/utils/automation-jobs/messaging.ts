import {
  MessagingProvider,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  AutomationJobConfigurationError,
  sendAutomationMessageToSlack,
} from "@/utils/automation-jobs/slack";
import type { Logger } from "@/utils/logger";
import { getMessagingAdapterRegistry } from "@/utils/messaging/chat-sdk/adapters";

export async function sendAutomationMessage({
  channel,
  route,
  text,
  logger,
}: {
  channel: {
    provider: MessagingProvider;
    accessToken: string | null;
    botUserId?: string | null;
    providerUserId?: string | null;
    teamId?: string | null;
  };
  route?: {
    targetId: string;
    targetType: MessagingRouteTargetType;
  } | null;
  text: string;
  logger: Logger;
}) {
  switch (channel.provider) {
    case MessagingProvider.SLACK: {
      return sendAutomationMessageToSlack({
        channel,
        route,
        text,
        logger,
      });
    }
    case MessagingProvider.TEAMS: {
      return sendAutomationMessageToTeams({
        providerUserId:
          route?.targetType === MessagingRouteTargetType.DIRECT_MESSAGE
            ? route.targetId
            : (channel.providerUserId ?? null),
        text,
        logger,
      });
    }
    case MessagingProvider.TELEGRAM: {
      return sendAutomationMessageToTelegram({
        teamId:
          route?.targetType === MessagingRouteTargetType.DIRECT_MESSAGE
            ? route.targetId
            : (channel.teamId ?? null),
        providerUserId:
          route?.targetType === MessagingRouteTargetType.DIRECT_MESSAGE
            ? route.targetId
            : (channel.providerUserId ?? null),
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
    typeof getMessagingAdapterRegistry
  >["typedAdapters"]["teams"];
  try {
    teamsAdapter = getMessagingAdapterRegistry().typedAdapters.teams;
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
  teamId,
  providerUserId,
  text,
  logger,
}: {
  teamId: string | null | undefined;
  providerUserId: string | null;
  text: string;
  logger: Logger;
}) {
  const destination = teamId || providerUserId;

  if (!destination) {
    throw new AutomationJobConfigurationError(
      "Telegram channel is missing a direct-message target",
    );
  }

  let telegramAdapter: ReturnType<
    typeof getMessagingAdapterRegistry
  >["typedAdapters"]["telegram"];
  try {
    telegramAdapter = getMessagingAdapterRegistry().typedAdapters.telegram;
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
    destination,
  });

  telegramLogger.info("Sending Telegram automation message");

  const threadId = await telegramAdapter.openDM(destination);
  const response = await telegramAdapter.postMessage(threadId, text);

  telegramLogger.info("Telegram automation message sent");

  return {
    channelId: threadId,
    messageId: response.id ?? null,
  };
}
