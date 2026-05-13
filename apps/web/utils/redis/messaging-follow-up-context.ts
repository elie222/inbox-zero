import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import type { MessagingPlatform } from "@/utils/messaging/platforms";
import { redis } from "@/utils/redis";

const logger = createScopedLogger("redis/messaging-follow-up-context");

const CACHE_KEY_PREFIX = "messaging:follow-up-context";
const CACHE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

type MessagingFollowUpProvider = Extract<
  MessagingPlatform,
  "slack" | "telegram"
>;

export type MessagingFollowUpContext = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  trackerId: string;
  subject: string;
  counterpartyEmail: string;
};

type ContextLookupKey = {
  provider: MessagingFollowUpProvider;
  channelId: string;
  messageTs: string;
};

function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}

function getContextKey({ provider, channelId, messageTs }: ContextLookupKey) {
  return `${CACHE_KEY_PREFIX}:${provider}:${channelId}:${messageTs}`;
}

export async function saveMessagingFollowUpContext(
  key: ContextLookupKey,
  context: MessagingFollowUpContext,
): Promise<void> {
  if (!isRedisConfigured()) return;

  try {
    await redis.set(getContextKey(key), context, { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    logger.warn("Failed to save messaging follow-up context", {
      provider: key.provider,
      error,
    });
  }
}

export async function getMessagingFollowUpContext(
  key: ContextLookupKey,
): Promise<MessagingFollowUpContext | null> {
  if (!isRedisConfigured()) return null;

  try {
    return await redis.get<MessagingFollowUpContext>(getContextKey(key));
  } catch (error) {
    logger.warn("Failed to read messaging follow-up context", {
      provider: key.provider,
      error,
    });
    return null;
  }
}
