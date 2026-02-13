import type { WebClient } from "@slack/web-api";

export async function addReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  name: string,
): Promise<void> {
  try {
    await client.reactions.add({ channel, timestamp, name });
  } catch (error) {
    console.warn("Failed to add Slack reaction", { name, error });
  }
}

export async function removeReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  name: string,
): Promise<void> {
  try {
    await client.reactions.remove({ channel, timestamp, name });
  } catch (error) {
    console.warn("Failed to remove Slack reaction", { name, error });
  }
}
