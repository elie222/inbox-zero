import { MessagingProvider } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  formatSlackAppMention,
  isSlackDmChannel,
  resolveSlackDestination,
} from "@/utils/messaging/providers/slack/send";
import type { AutomationMessagingChannel } from "./messaging-channel";

type SlackMessagingChannel = Pick<
  AutomationMessagingChannel,
  "provider" | "accessToken" | "botUserId" | "providerUserId" | "channelId"
>;

export class AutomationJobConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationJobConfigurationError";
  }
}

export async function sendAutomationMessageToSlack({
  channel,
  text,
  logger,
}: {
  channel: SlackMessagingChannel;
  text: string;
  logger: Logger;
}) {
  const slackLogger = logger.with({
    component: "sendAutomationMessageToSlack",
    destination: channel.channelId ?? channel.providerUserId ?? null,
  });

  if (channel.provider !== MessagingProvider.SLACK) {
    const error = new AutomationJobConfigurationError(
      "Only Slack messaging channels are supported",
    );
    slackLogger.error("Unsupported messaging provider for automation job", {
      provider: channel.provider,
      error,
    });
    throw error;
  }

  if (!channel.accessToken) {
    const error = new AutomationJobConfigurationError(
      "Messaging channel is missing Slack access token",
    );
    slackLogger.error("Slack channel is missing access token", { error });
    throw error;
  }

  const client = createSlackClient(channel.accessToken);
  const formattedText = isSlackDmChannel(channel.channelId)
    ? text
    : `${text}\n\n_Reply with ${formatSlackAppMention(channel.botUserId)} to chat about your emails._`;

  slackLogger.info("Sending Slack automation message");

  const destinationChannelId = await resolveSlackDestination({
    accessToken: channel.accessToken,
    channelId: channel.channelId,
    providerUserId: channel.providerUserId,
  });

  if (!destinationChannelId) {
    const error = new AutomationJobConfigurationError(
      "No Slack destination available for automation job",
    );
    slackLogger.error("No Slack destination available for automation job", {
      hasProviderUserId: Boolean(channel.providerUserId),
      hasChannelId: Boolean(channel.channelId),
      error,
    });
    throw error;
  }

  try {
    const response = await client.chat.postMessage({
      channel: destinationChannelId,
      text: formattedText,
    });
    slackLogger.info("Slack automation message sent");

    return {
      channelId: destinationChannelId,
      messageId: response.ts ?? null,
    };
  } catch (error) {
    if (isSlackError(error) && error.data?.error === "not_in_channel") {
      if (!channel.channelId) {
        slackLogger.error("Slack destination is not a joinable channel", {
          slackError: error.data?.error,
          error,
        });
        throw error;
      }

      slackLogger.info("Joining Slack channel before retrying message");
      await client.conversations.join({ channel: channel.channelId });
      const response = await client.chat.postMessage({
        channel: channel.channelId,
        text: formattedText,
      });
      slackLogger.info("Slack automation message sent after joining channel");

      return {
        channelId: channel.channelId,
        messageId: response.ts ?? null,
      };
    }

    slackLogger.error("Failed to send Slack automation message", {
      error,
      slackError: isSlackError(error) ? error.data?.error : null,
    });
    throw error;
  }
}

function isSlackError(
  error: unknown,
): error is Error & { data?: { error?: string } } {
  return error instanceof Error && "data" in error;
}
