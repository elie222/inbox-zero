import { MessagingProvider } from "@/generated/prisma/enums";
import { createSlackClient } from "@inboxzero/slack";

type SlackMessagingChannel = {
  provider: MessagingProvider;
  accessToken: string | null;
  providerUserId: string | null;
  channelId: string | null;
};

export async function sendAutomationMessageToSlack({
  channel,
  text,
}: {
  channel: SlackMessagingChannel;
  text: string;
}) {
  if (channel.provider !== MessagingProvider.SLACK) {
    throw new Error("Only Slack messaging channels are supported");
  }

  if (!channel.accessToken) {
    throw new Error("Messaging channel is missing Slack access token");
  }

  const client = createSlackClient(channel.accessToken);

  const destinationChannelId = channel.providerUserId
    ? await resolveDirectMessageChannelId(client, channel.providerUserId)
    : channel.channelId;

  if (!destinationChannelId) {
    throw new Error("No Slack destination available for automation job");
  }

  try {
    const response = await client.chat.postMessage({
      channel: destinationChannelId,
      text,
    });

    return {
      channelId: destinationChannelId,
      messageTs: response.ts ?? null,
    };
  } catch (error) {
    if (isSlackError(error) && error.data?.error === "not_in_channel") {
      if (!channel.channelId) throw error;

      await client.conversations.join({ channel: channel.channelId });
      const response = await client.chat.postMessage({
        channel: channel.channelId,
        text,
      });

      return {
        channelId: channel.channelId,
        messageTs: response.ts ?? null,
      };
    }

    throw error;
  }
}

async function resolveDirectMessageChannelId(
  client: ReturnType<typeof createSlackClient>,
  providerUserId: string,
) {
  const response = await client.conversations.open({ users: providerUserId });
  return response.channel?.id ?? null;
}

function isSlackError(
  error: unknown,
): error is Error & { data?: { error?: string } } {
  return error instanceof Error && "data" in error;
}
