import { redis } from "@/utils/redis";

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `reply-tracker:analyzing:${emailAccountId}`;
}

export async function startAnalyzingReplyTracker({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  // expire in 5 minutes
  await redis.set(key, "true", { ex: 5 * 60 });
}

export async function stopAnalyzingReplyTracker({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  await redis.del(key);
}

export async function isAnalyzingReplyTracker({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  const result = await redis.get(key);
  return result === "true";
}
