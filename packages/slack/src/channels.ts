import type { WebClient } from "@slack/web-api";

export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
};

export async function listChannels(client: WebClient): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

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
  } while (cursor);

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}
