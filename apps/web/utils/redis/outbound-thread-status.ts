import { randomUUID } from "node:crypto";
import { redis } from "@/utils/redis";

const PROCESSING_TTL_SECONDS = 60 * 5;
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const PROCESSED_STATUS = "processed";
const MARK_PROCESSED_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], "${PROCESSED_STATUS}", "EX", tonumber(ARGV[2]))
return 1
`;
const CLEAR_LOCK_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

type OutboundThreadStatusKey = {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  lockToken?: string;
};

export async function acquireOutboundThreadStatusLock({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey): Promise<string | null> {
  const lockToken = randomUUID();
  const result = await redis.set(
    getOutboundThreadStatusKey({ emailAccountId, threadId, messageId }),
    lockToken,
    {
      ex: PROCESSING_TTL_SECONDS,
      nx: true,
    },
  );

  return result === "OK" ? lockToken : null;
}

export async function markOutboundThreadStatusProcessed({
  emailAccountId,
  threadId,
  messageId,
  lockToken,
}: OutboundThreadStatusKey): Promise<boolean> {
  if (!lockToken) return false;

  const result = await redis.eval<string[], number>(
    MARK_PROCESSED_IF_OWNED_SCRIPT,
    [getOutboundThreadStatusKey({ emailAccountId, threadId, messageId })],
    [lockToken, PROCESSED_TTL_SECONDS.toString()],
  );

  return result === 1;
}

export async function clearOutboundThreadStatusLock({
  emailAccountId,
  threadId,
  messageId,
  lockToken,
}: OutboundThreadStatusKey): Promise<boolean> {
  if (!lockToken) return false;

  const result = await redis.eval<string[], number>(
    CLEAR_LOCK_IF_OWNED_SCRIPT,
    [getOutboundThreadStatusKey({ emailAccountId, threadId, messageId })],
    [lockToken],
  );

  return result === 1;
}

function getOutboundThreadStatusKey({
  emailAccountId,
  threadId,
  messageId,
}: OutboundThreadStatusKey) {
  return `reply-tracker:outbound-thread-status:${emailAccountId}:${threadId}:${messageId}`;
}
