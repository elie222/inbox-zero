import { redis } from "@/utils/redis";

const PROCESSING_TTL_SECONDS = 60 * 5;
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;

type OutboundThreadStatusKey = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
};

function getOutboundThreadStatusKey({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey) {
  return `reply-tracker:outbound-thread-status:${emailAccountId}:${threadId}:${messageId}`;
}

export async function acquireOutboundThreadStatusLock({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey): Promise<boolean> {
  const result = await redis.set(
    getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
    "processing",
    {
      ex: PROCESSING_TTL_SECONDS,
      nx: true,
    },
  );

  return result === "OK";
}

export async function markOutboundThreadStatusProcessed({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey): Promise<void> {
  await redis.set(
    getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
    "processed",
    {
      ex: PROCESSED_TTL_SECONDS,
    },
  );
}

export async function clearOutboundThreadStatusLock({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey): Promise<void> {
  await redis.del(
    getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
  );
}
