import type { KnownBlock, Block } from "@slack/types";
import type { WebClient } from "@slack/web-api";
import { MessagingRouteTargetType } from "@/generated/prisma/enums";
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
import { buildDigestBlocks, type DigestBlocksParams } from "./messages/digest";
import {
  buildFollowUpReminderBlocks,
  type FollowUpReminderBlocksParams,
} from "./messages/follow-up-reminder";
import { getFollowUpCopy } from "@/utils/follow-up/copy";

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
    text: `📅 Briefing for ${meetingTitle}, starting at ${formattedTime}`,
  });
}

export async function sendChannelConfirmation({
  accessToken,
  channelId,
  botUserId,
}: {
  accessToken: string;
  channelId: string;
  botUserId?: string | null;
}): Promise<void> {
  const client = createSlackClient(accessToken);

  await postMessageWithJoin(client, channelId, {
    text: `✅ Inbox Zero connected! You can ${formatSlackAppMention(botUserId)} here to chat about your emails. If you enable meeting briefs or attachment filing notifications, I can send those in this channel too.`,
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

  await client.chat.postMessage(
    disableSlackLinkUnfurls({
      channel: userId,
      text: "✅ Inbox Zero connected. Next, choose a private channel in Inbox Zero Settings for meeting brief and attachment notifications, then invite @InboxZero there. You can also DM me anytime to chat about your emails.",
    }),
  );
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
  senderEmail,
  fileId,
}: SlackDocumentFiledParams): Promise<void> {
  const client = createSlackClient(accessToken);
  const blocks = buildDocumentFiledBlocks({
    filename,
    folderPath,
    driveProvider,
    senderEmail,
    fileId,
  });

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: `📨 Filed ${filename} to ${folderPath}`,
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
  senderEmail,
}: SlackDocumentAskParams): Promise<void> {
  const client = createSlackClient(accessToken);
  const blocks = buildDocumentAskBlocks({ filename, reasoning, senderEmail });

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: `📄 Where should I file ${filename}?`,
  });
}

export type SlackDigestParams = DigestBlocksParams & {
  accessToken: string;
  channelId: string;
};

export async function sendDigestToSlack({
  accessToken,
  channelId,
  date,
  ruleNames,
  itemsByRule,
}: SlackDigestParams): Promise<void> {
  const client = createSlackClient(accessToken);
  const blocks = buildDigestBlocks({
    date,
    ruleNames,
    itemsByRule,
  });

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: "📋 Your Inbox Zero digest",
  });
}

export type SlackFollowUpReminderParams = FollowUpReminderBlocksParams & {
  accessToken: string;
  channelId: string;
};

export async function sendFollowUpReminderToSlack({
  accessToken,
  channelId,
  ...blockParams
}: SlackFollowUpReminderParams): Promise<void> {
  const client = createSlackClient(accessToken);
  const blocks = buildFollowUpReminderBlocks(blockParams);
  const { emoji } = getFollowUpCopy(blockParams.trackerType);

  await postMessageWithJoin(client, channelId, {
    blocks,
    text: `${emoji} Follow-up: ${blockParams.subject}`,
  });
}

/**
 * Sentinel value for `channelId` that indicates messages should be sent
 * as a direct message to the `providerUserId` instead of a channel.
 */
export const SLACK_DM_CHANNEL_SENTINEL = "DM";

export function isSlackDmChannel(channelId: string | null): boolean {
  return channelId === SLACK_DM_CHANNEL_SENTINEL;
}

export async function resolveSlackDestination({
  accessToken,
  channelId,
  providerUserId,
}: {
  accessToken: string;
  channelId: string | null;
  providerUserId: string | null;
}): Promise<string | null> {
  if (channelId && !isSlackDmChannel(channelId)) return channelId;

  if (isSlackDmChannel(channelId) && providerUserId) {
    const client = createSlackClient(accessToken);
    const response = await client.conversations.open({
      users: providerUserId,
    });
    return response.channel?.id ?? null;
  }

  return null;
}

export async function resolveSlackRouteDestination({
  accessToken,
  route,
}: {
  accessToken: string;
  route:
    | {
        targetType: MessagingRouteTargetType;
        targetId: string;
      }
    | null
    | undefined;
}): Promise<string | null> {
  if (!route) return null;

  if (route.targetType === MessagingRouteTargetType.CHANNEL) {
    return route.targetId;
  }

  const client = createSlackClient(accessToken);
  const response = await client.conversations.open({
    users: route.targetId,
  });
  return response.channel?.id ?? null;
}

export function formatSlackAppMention(botUserId: string | null | undefined) {
  return botUserId ? `<@${botUserId}>` : "@Inbox Zero";
}

export function disableSlackLinkUnfurls<T extends object>(message: T) {
  return {
    ...message,
    unfurl_links: false,
    unfurl_media: false,
  };
}

type Blocks = (KnownBlock | Block)[];

async function postMessageWithJoin(
  client: WebClient,
  channelId: string,
  message: { text: string; blocks?: Blocks },
): Promise<void> {
  const args = disableSlackLinkUnfurls(
    message.blocks
      ? { channel: channelId, blocks: message.blocks, text: message.text }
      : { channel: channelId, text: message.text },
  );

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
