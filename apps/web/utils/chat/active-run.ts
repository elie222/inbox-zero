import "server-only";
import Redis from "ioredis";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream/ioredis";
import { env } from "@/env";
import { createScopedLogger, type Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";

const STOP_CHANNEL = "assistant-chat:stop";
const SUBSCRIBE_TIMEOUT_MS = 2000;
// The chat route's maxDuration. A marker older than this belongs to a run whose
// instance died before it could clear it.
const MAX_RUN_MS = 800_000;
const logger = createScopedLogger("assistant-chat-run");

declare global {
  var assistantChatRuns: Map<string, AbortController> | undefined;
  var assistantChatRedis:
    | {
        publisher: Redis;
        streams: ResumableStreamContext;
        listening: Promise<void>;
      }
    | undefined;
}

const runs = global.assistantChatRuns ?? new Map<string, AbortController>();
global.assistantChatRuns = runs;

// Resuming needs a shared Redis; without one, replies still stream and save,
// they just can't be reattached after a dropped connection.
export function getChatStreamContext() {
  return getRedis()?.streams ?? null;
}

// A stop request can land on any server instance, so the instance running the
// reply listens for stops broadcast over Redis and aborts its own run.
export async function startChatRun(streamId: string) {
  const redis = getRedis();
  // Hear stops before the run is marked active so an early one isn't missed;
  // bounded so a Redis outage doesn't hold up the reply.
  if (redis) await Promise.race([redis.listening, sleep(SUBSCRIBE_TIMEOUT_MS)]);
  const controller = new AbortController();
  runs.set(streamId, controller);
  return {
    abortSignal: controller.signal,
    end: () => runs.delete(streamId),
  };
}

export async function stopChatRun(streamId: string, requestLogger: Logger) {
  runs.get(streamId)?.abort();
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.publisher.publish(STOP_CHANNEL, streamId);
  } catch (error) {
    requestLogger.warn("Unable to publish assistant chat stop", { error });
  }
}

// Claims the chat for a new reply unless another live one holds it.
export async function claimActiveStream({
  chatId,
  streamId,
}: {
  chatId: string;
  streamId: string;
}) {
  const { count } = await prisma.chat.updateMany({
    where: {
      id: chatId,
      OR: [
        { activeStreamId: null },
        { activeStreamStartedAt: null },
        { activeStreamStartedAt: { lt: new Date(Date.now() - MAX_RUN_MS) } },
      ],
    },
    data: { activeStreamId: streamId, activeStreamStartedAt: new Date() },
  });
  return count > 0;
}

export function getLiveStreamId(chat: {
  activeStreamId: string | null;
  activeStreamStartedAt: Date | null;
}) {
  if (!chat.activeStreamId || !chat.activeStreamStartedAt) return null;
  if (Date.now() - chat.activeStreamStartedAt.getTime() > MAX_RUN_MS) {
    return null;
  }
  return chat.activeStreamId;
}

export async function clearActiveStream({
  chatId,
  streamId,
}: {
  chatId: string;
  streamId: string;
}) {
  // Only clear our own stream; a newer reply may already have replaced it.
  await prisma.chat.updateMany({
    where: { id: chatId, activeStreamId: streamId },
    data: { activeStreamId: null, activeStreamStartedAt: null },
  });
}

function getRedis() {
  if (!env.REDIS_URL) return null;
  if (global.assistantChatRedis) return global.assistantChatRedis;

  const publisher = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  });
  const subscriber = new Redis(env.REDIS_URL);
  // Publish failures surface on the calls that hit them, where they are handled.
  publisher.on("error", () => {});
  subscriber.on("error", (error) => {
    logger.warn("Assistant chat Redis subscriber error", { error });
  });
  subscriber.on("message", (channel: string, streamId: string) => {
    if (channel === STOP_CHANNEL) runs.get(streamId)?.abort();
  });
  const listening = subscriber
    .subscribe(STOP_CHANNEL)
    .then(() => undefined)
    .catch((error) => {
      logger.error("Unable to listen for assistant chat stops", { error });
    });

  global.assistantChatRedis = {
    publisher,
    listening,
    streams: createResumableStreamContext({
      keyPrefix: "assistant-chat",
      waitUntil: after,
      publisher,
      subscriber,
    }),
  };
  return global.assistantChatRedis;
}
