import "server-only";
import { EventEmitter } from "node:events";
import { redis } from "@/utils/redis";
import type { Logger } from "@/utils/logger";

declare global {
  var teamConversationEvents: EventEmitter | undefined;
}

const localEvents = global.teamConversationEvents ?? new EventEmitter();
global.teamConversationEvents = localEvents;

export function conversationChangeChannel(conversationId: string) {
  return `team-comments:${conversationId}`;
}

export async function publishConversationChange(
  conversationId: string,
  logger: Logger,
) {
  localEvents.emit(conversationChangeChannel(conversationId));
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
