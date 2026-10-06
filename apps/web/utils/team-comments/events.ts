import "server-only";
import { EventEmitter } from "node:events";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";

declare global {
  var teamConversationEvents: EventEmitter | undefined;
}

const localEvents = global.teamConversationEvents ?? new EventEmitter();
global.teamConversationEvents = localEvents;

export function conversationChangeChannel(conversationId: string) {
  return `team-comments:${conversationId}`;
}

// With Redis configured, every stream listens on Redis, so the in-process
// emitter is only the fallback for single-process installs without it.
export async function publishConversationChange(
  conversationId: string,
  logger: Logger,
) {
  if (!env.REDIS_URL) {
    localEvents.emit(conversationChangeChannel(conversationId));
    return;
  }
  try {
    await redis.publish(conversationChangeChannel(conversationId), "{}");
  } catch (error) {
    logger.warn("Unable to publish conversation invalidation", { error });
  }
}

export function subscribeLocalConversationChange(
  conversationId: string,
  listener: () => void,
) {
  const channel = conversationChangeChannel(conversationId);
  localEvents.on(channel, listener);
  return () => localEvents.off(channel, listener);
}
