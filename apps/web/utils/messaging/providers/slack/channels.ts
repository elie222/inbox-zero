import type { WebClient } from "@slack/web-api";

export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
};

export async function getChannelInfo(
  client: WebClient,
  channelId: string,
): Promise<SlackChannel | null> {
  const response = await client.conversations.info({ channel: channelId });

  if (!response.channel?.id || !response.channel?.name) return null;

  return {
    id: response.channel.id,
    name: response.channel.name,
    isPrivate: response.channel.is_private ?? false,
  };
}

const MAX_PAGES = 10;

export async function listChannels(client: WebClient): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const response = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });

    if (response.channels) {
      for (const channel of response.channels) {
        if (channel.id && channel.name) {
          channels.push({
            id: channel.id,
            name: channel.name,
            isPrivate: channel.is_private ?? false,
          });
        }
      }
    }

    cursor = response.response_metadata?.next_cursor;
    pages++;
  } while (cursor && pages < MAX_PAGES);

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}
