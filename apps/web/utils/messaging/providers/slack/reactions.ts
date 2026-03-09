import type { WebClient } from "@slack/web-api";

type Logger = { warn: (msg: string, meta?: Record<string, unknown>) => void };

export async function addReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  name: string,
  logger?: Logger,
): Promise<void> {
  try {
    await client.reactions.add({ channel, timestamp, name });
  } catch (error) {
    logger?.warn("Failed to add Slack reaction", { name, error });
  }
}

export async function removeReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  name: string,
  logger?: Logger,
): Promise<void> {
  try {
    await client.reactions.remove({ channel, timestamp, name });
  } catch (error) {
    logger?.warn("Failed to remove Slack reaction", { name, error });
  }
}
