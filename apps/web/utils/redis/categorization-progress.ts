import { z } from "zod";
import { redis } from "@/utils/redis";
import { ONE_MINUTE_MS } from "@/utils/date";

const categorizationProgressSchema = z.object({
  pageIndex: z.number(),
  categorized: z.number(),
  remaining: z.number(),
});
type RedisCategorizationProgress = z.infer<typeof categorizationProgressSchema>;

function getKey(userId: string) {
  return `categorization-progress:${userId}`;
}

export async function getCategorizationProgress({
  userId,
}: {
  userId: string;
}) {
  const key = getKey(userId);
  const progress = await redis.get<RedisCategorizationProgress>(key);
  if (!progress) return null;
  return progress;
}

export async function saveCategorizationProgress({
  userId,
  pageIndex,
  incrementCategorized,
  incrementRemaining,
}: {
  userId: string;
  pageIndex: number;
  incrementCategorized: number;
  incrementRemaining: number;
}) {
  const existingProgress = await getCategorizationProgress({ userId });
  const updatedProgress: RedisCategorizationProgress = {
    pageIndex,
    categorized: (existingProgress?.categorized || 0) + incrementCategorized,
    remaining: (existingProgress?.remaining || 0) - incrementRemaining,
  };

  const key = getKey(userId);
  // Store progress for 5 minutes
  await redis.set(key, updatedProgress, { ex: 5 * ONE_MINUTE_MS });
  return true;
}

export async function deleteCategorizationProgress({
  userId,
}: {
  userId: string;
}) {
  const key = getKey(userId);
  await redis.del(key);
}
