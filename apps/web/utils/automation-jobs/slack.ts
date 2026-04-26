import {
  MessagingProvider,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  disableSlackLinkUnfurls,
  formatSlackAppMention,
  resolveSlackRouteDestination,
} from "@/utils/messaging/providers/slack/send";
import type { AutomationMessagingChannel } from "./messaging-channel";

type SlackMessagingChannel = Pick<
  AutomationMessagingChannel,
  "provider" | "accessToken" | "botUserId"
>;

export class AutomationJobConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationJobConfigurationError";
  }
}

export async function sendAutomationMessageToSlack({
  channel,
  route,
  text,
  logger,
}: {
  channel: SlackMessagingChannel;
  route?: {
    targetId: string;
    targetType: MessagingRouteTargetType;
  } | null;
  text: string;
  logger: Logger;
}) {
  const slackLogger = logger.with({
    component: "sendAutomationMessageToSlack",
    destination: route?.targetId ?? null,
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
  const formattedText =
    route?.targetType === MessagingRouteTargetType.DIRECT_MESSAGE
      ? text
      : `${text}\n\n_Reply with ${formatSlackAppMention(channel.botUserId)} to chat about your emails._`;

  slackLogger.info("Sending Slack automation message");

  const destinationChannelId = await resolveSlackRouteDestination({
    accessToken: channel.accessToken,
    route,
  });

  if (!destinationChannelId) {
    const error = new AutomationJobConfigurationError(
      "No Slack destination available for automation job",
    );
    slackLogger.error("No Slack destination available for automation job", {
      hasRoute: Boolean(route),
      error,
    });
    throw error;
  }

  try {
    const response = await client.chat.postMessage(
      disableSlackLinkUnfurls({
        channel: destinationChannelId,
        text: formattedText,
      }),
    );
    slackLogger.info("Slack automation message sent");

    return {
      channelId: destinationChannelId,
      messageId: response.ts ?? null,
    };
  } catch (error) {
    if (isSlackError(error) && error.data?.error === "not_in_channel") {
      if (!route || route.targetType !== MessagingRouteTargetType.CHANNEL) {
        slackLogger.error("Slack destination is not a joinable channel", {
          slackError: error.data?.error,
          error,
        });
        throw error;
      }

      slackLogger.info("Joining Slack channel before retrying message");
      await client.conversations.join({ channel: route.targetId });
      const response = await client.chat.postMessage(
        disableSlackLinkUnfurls({
          channel: route.targetId,
          text: formattedText,
        }),
      );
      slackLogger.info("Slack automation message sent after joining channel");

      return {
        channelId: route.targetId,
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
