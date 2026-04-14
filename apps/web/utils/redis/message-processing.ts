import { randomUUID } from "node:crypto";
import { redis } from "@/utils/redis";

const OUTBOUND_PROCESSING_TTL_SECONDS = 60 * 5;
const OUTBOUND_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const OUTBOUND_PROCESSED_STATUS = "processed";
const MARK_PROCESSED_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], "${OUTBOUND_PROCESSED_STATUS}", "EX", tonumber(ARGV[2]))
return 1
`;
const CLEAR_LOCK_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

function getProcessingKey({
  userEmail,
  messageId,
}: {
  userEmail: string;
  messageId: string;
}) {
  return `processing-message:${userEmail}:${messageId}`;
}

export async function markMessageAsProcessing({
  userEmail,
  messageId,
}: {
  userEmail: string;
  messageId: string;
}): Promise<boolean> {
  const result = await redis.set(
    getProcessingKey({ userEmail, messageId }),
    "true",
    {
      ex: 60 * 5, // 5 minutes
      nx: true, // Only set if key doesn't exist
    },
  );

  // Redis returns "OK" if the key was set, and null if it was already set
  return result === "OK";
}

type OutboundMessageKey = {
  emailAccountId: string;
  messageId: string;
  lockToken?: string;
};

export async function acquireOutboundMessageLock({
  emailAccountId,
  messageId,
}: OutboundMessageKey): Promise<string | null> {
  const lockToken = randomUUID();
  const result = await redis.set(
    getOutboundMessageKey({ emailAccountId, messageId }),
    lockToken,
    {
      ex: OUTBOUND_PROCESSING_TTL_SECONDS,
      nx: true,
    },
  );

  return result === "OK" ? lockToken : null;
}

export async function markOutboundMessageProcessed({
  emailAccountId,
  messageId,
  lockToken,
}: OutboundMessageKey): Promise<boolean> {
  if (!lockToken) return false;

  const result = await redis.eval<string[], number>(
    MARK_PROCESSED_IF_OWNED_SCRIPT,
    [getOutboundMessageKey({ emailAccountId, messageId })],
    [lockToken, OUTBOUND_PROCESSED_TTL_SECONDS.toString()],
  );

  return result === 1;
}

export async function clearOutboundMessageLock({
  emailAccountId,
  messageId,
  lockToken,
}: OutboundMessageKey): Promise<boolean> {
  if (!lockToken) return false;

  const result = await redis.eval<string[], number>(
    CLEAR_LOCK_IF_OWNED_SCRIPT,
    [getOutboundMessageKey({ emailAccountId, messageId })],
    [lockToken],
  );

  return result === 1;
}

function getOutboundMessageKey({
  emailAccountId,
  messageId,
}: OutboundMessageKey) {
  return `reply-tracker:outbound-message:${emailAccountId}:${messageId}`;
}
