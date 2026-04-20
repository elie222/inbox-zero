import { randomUUID } from "node:crypto";
import { redis } from "@/utils/redis";

const MARK_PROCESSED_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "EX", tonumber(ARGV[3]))
return 1
`;
const CLEAR_LOCK_IF_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

export async function acquireOwnedLock({
  key,
  processingTtlSeconds,
}: {
  key: string;
  processingTtlSeconds: number;
}): Promise<string | null> {
  const lockToken = randomUUID();
  const result = await redis.set(key, lockToken, {
    ex: processingTtlSeconds,
    nx: true,
  });

  return result === "OK" ? lockToken : null;
}

export async function markOwnedLockProcessed({
  key,
  lockToken,
  processedStatus,
  processedTtlSeconds,
}: {
  key: string;
  lockToken?: string;
  processedStatus: string;
  processedTtlSeconds: number;
}): Promise<boolean> {
  if (!lockToken) return false;

  const result = await redis.eval<string[], number>(
    MARK_PROCESSED_IF_OWNED_SCRIPT,
    [key],
    [lockToken, processedStatus, processedTtlSeconds.toString()],
  );

  return result === 1;
}

export async function clearOwnedLock({
  key,
  lockToken,
}: {
  key: string;
  lockToken?: string;
}): Promise<boolean> {
  if (!lockToken) return false;

  const result = await redis.eval<string[], number>(
    CLEAR_LOCK_IF_OWNED_SCRIPT,
    [key],
    [lockToken],
  );

  return result === 1;
}
