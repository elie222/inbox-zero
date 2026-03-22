import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";

export async function postToChiefOfStaff(params: {
  accessToken: string;
  channelId: string;
  blocks: KnownBlock[];
  text: string;
  threadTs?: string;
}): Promise<string> {
  const client = new WebClient(params.accessToken);
  const result = await client.chat.postMessage({
    channel: params.channelId,
    blocks: params.blocks,
    text: params.text,
    thread_ts: params.threadTs,
  });
  if (!result.ts)
    throw new Error("Slack postMessage did not return a timestamp");
  return result.ts;
}

export async function updateSlackMessage(params: {
  accessToken: string;
  channelId: string;
  messageTs: string;
  blocks: KnownBlock[];
  text: string;
}): Promise<void> {
  const client = new WebClient(params.accessToken);
  await client.chat.update({
    channel: params.channelId,
    ts: params.messageTs,
    blocks: params.blocks,
    text: params.text,
  });
}
