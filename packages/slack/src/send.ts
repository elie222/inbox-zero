import type { WebClient } from "@slack/web-api";
import { createSlackClient } from "./client";
import {
  buildMeetingBriefingBlocks,
  type MeetingBriefingBlocksParams,
} from "./messages/meeting-briefing";

export type SlackBriefingParams = MeetingBriefingBlocksParams & {
  accessToken: string;
  channelId: string;
};

export async function sendMeetingBriefingToSlack({
  accessToken,
  channelId,
  meetingTitle,
  formattedTime,
  videoConferenceLink,
  eventUrl,
  briefingContent,
}: SlackBriefingParams): Promise<void> {
  const client = createSlackClient(accessToken);

  const blocks = buildMeetingBriefingBlocks({
    meetingTitle,
    formattedTime,
    videoConferenceLink,
    eventUrl,
    briefingContent,
  });

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: `Briefing for ${meetingTitle}, starting at ${formattedTime}`,
  });
}

export async function sendChannelConfirmation({
  accessToken,
  channelId,
}: {
  accessToken: string;
  channelId: string;
}): Promise<void> {
  const client = createSlackClient(accessToken);

  await postMessageWithJoin(client, channelId, {
    text: "Inbox Zero connected! Meeting briefings will be delivered to this channel.",
  });
}

async function postMessageWithJoin(
  client: WebClient,
  channelId: string,
  message: Parameters<WebClient["chat"]["postMessage"]>[0],
): Promise<void> {
  try {
    await client.chat.postMessage({ ...message, channel: channelId });
  } catch (error: unknown) {
    if (isSlackError(error) && error.data?.error === "not_in_channel") {
      try {
        await client.conversations.join({ channel: channelId });
      } catch (joinError: unknown) {
        if (
          isSlackError(joinError) &&
          joinError.data?.error === "missing_scope"
        ) {
          throw new Error(
            "Bot lacks channels:join scope. Please reconnect Slack in Settings to update permissions.",
          );
        }
        throw joinError;
      }
      await client.chat.postMessage({ ...message, channel: channelId });
      return;
    }
    throw error;
  }
}

function isSlackError(
  error: unknown,
): error is Error & { data?: { error?: string } } {
  return error instanceof Error && "data" in error;
}
