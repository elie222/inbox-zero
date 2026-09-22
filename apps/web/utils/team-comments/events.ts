import "server-only";
import { EventEmitter } from "node:events";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { RedisSubscriber } from "@/utils/redis/subscriber";

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
  if (!env.REDIS_URL) return;
  let publisher: ReturnType<typeof RedisSubscriber.createInstance> | undefined;
  try {
    publisher = RedisSubscriber.createInstance();
    await publisher.publish(conversationChangeChannel(conversationId), "{}");
  } catch (error) {
    logger.warn("Unable to publish conversation invalidation", { error });
  } finally {
    publisher?.disconnect();
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
