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

  await client.chat.postMessage({
    channel: channelId,
    blocks,
    text: `Briefing for ${meetingTitle}, starting at ${formattedTime}`,
  });
}
