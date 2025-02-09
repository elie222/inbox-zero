import { redis } from "@/utils/redis";

function getKey(userId: string) {
  return `reply-tracker:analyzing:${userId}`;
}

export async function startAnalyzingReplyTracker(userId: string) {
  const key = getKey(userId);
  // expire in 5 minutes
  await redis.set(key, "true", { ex: 5 * 60 });
}

export async function stopAnalyzingReplyTracker(userId: string) {
  const key = getKey(userId);
  await redis.del(key);
}

export async function isAnalyzingReplyTracker(userId: string) {
  const key = getKey(userId);
  const result = await redis.get(key);
  return result === "true";
}
