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

const STOP_CHANNEL = "assistant-chat:stop";
const logger = createScopedLogger("assistant-chat-run");

declare global {
  var assistantChatRuns: Map<string, AbortController> | undefined;
  var assistantChatRedis:
    | { publisher: Redis; subscriber: Redis; streams: ResumableStreamContext }
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
export function startChatRun(streamId: string) {
  getRedis();
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
    data: { activeStreamId: null },
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
  subscriber.subscribe(STOP_CHANNEL).catch((error) => {
    logger.error("Unable to listen for assistant chat stops", { error });
  });

  global.assistantChatRedis = {
    publisher,
    subscriber,
    streams: createResumableStreamContext({
      keyPrefix: "assistant-chat",
      waitUntil: after,
      publisher,
      subscriber,
    }),
  };
  return global.assistantChatRedis;
}
