import type { KnownBlock, Block } from "@slack/types";
import type { WebClient } from "@slack/web-api";
import { createSlackClient } from "./client";
import {
  buildMeetingBriefingBlocks,
  type MeetingBriefingBlocksParams,
} from "./messages/meeting-briefing";
import {
  buildDocumentFiledBlocks,
  buildDocumentAskBlocks,
  type DocumentFiledBlocksParams,
  type DocumentAskBlocksParams,
} from "./messages/document-filing";

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
    text: "Inbox Zero connected! You can @mention me here to chat about your emails. I’ll also send meeting brief and attachment filing notifications in this channel.",
  });
}

export async function sendConnectionOnboardingDirectMessage({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<void> {
  const client = createSlackClient(accessToken);

  await client.chat.postMessage({
    channel: userId,
    text: "Inbox Zero connected. Next, choose a private channel in Inbox Zero Settings for meeting brief and attachment notifications, then invite @InboxZero there. You can also DM me anytime to chat about your emails.",
  });
}

export type SlackDocumentFiledParams = DocumentFiledBlocksParams & {
  accessToken: string;
  channelId: string;
};

export async function sendDocumentFiledToSlack({
  accessToken,
  channelId,
  filename,
  folderPath,
  driveProvider,
}: SlackDocumentFiledParams): Promise<void> {
  const client = createSlackClient(accessToken);
  const blocks = buildDocumentFiledBlocks({
    filename,
    folderPath,
    driveProvider,
  });

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: `Filed ${filename} to ${folderPath}`,
  });
}

export type SlackDocumentAskParams = DocumentAskBlocksParams & {
  accessToken: string;
  channelId: string;
};

export async function sendDocumentAskToSlack({
  accessToken,
  channelId,
  filename,
  reasoning,
}: SlackDocumentAskParams): Promise<void> {
  const client = createSlackClient(accessToken);
  const blocks = buildDocumentAskBlocks({ filename, reasoning });

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: `Where should I file ${filename}?`,
  });
}

type Blocks = (KnownBlock | Block)[];

async function postMessageWithJoin(
  client: WebClient,
  channelId: string,
  message: { text: string; blocks?: Blocks },
): Promise<void> {
  const args = message.blocks
    ? { channel: channelId, blocks: message.blocks, text: message.text }
    : { channel: channelId, text: message.text };

  try {
    await client.chat.postMessage(args);
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
      await client.chat.postMessage(args);
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
