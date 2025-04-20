import { redis } from "@/utils/redis";

function getKey(email: string) {
  return `reply-tracker:analyzing:${email}`;
}

export async function startAnalyzingReplyTracker({ email }: { email: string }) {
  const key = getKey(email);
  // expire in 5 minutes
  await redis.set(key, "true", { ex: 5 * 60 });
}

export async function stopAnalyzingReplyTracker({ email }: { email: string }) {
  const key = getKey(email);
  await redis.del(key);
}

export async function isAnalyzingReplyTracker({ email }: { email: string }) {
  const key = getKey(email);
  const result = await redis.get(key);
  return result === "true";
}
