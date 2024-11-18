import { z } from "zod";
import { redis } from "@/utils/redis";

const DEFAULT_TOTAL_PAGES = 10;

const categorizationProgressSchema = z.object({
  pageIndex: z.number(),
  totalPages: z.number().default(DEFAULT_TOTAL_PAGES),
  categorized: z.number(),
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
}: {
  userId: string;
  pageIndex: number;
  incrementCategorized: number;
}) {
  const existingProgress = await getCategorizationProgress({ userId });
  const updatedProgress: RedisCategorizationProgress = {
    pageIndex,
    totalPages: existingProgress?.totalPages || DEFAULT_TOTAL_PAGES,
    categorized: (existingProgress?.categorized || 0) + incrementCategorized,
  };

  const key = getKey(userId);
  // Store progress for 2 minutes
  await redis.set(key, updatedProgress, { ex: 2 * 60 });
  return updatedProgress;
}

export async function deleteCategorizationProgress({
  userId,
}: {
  userId: string;
}) {
  const key = getKey(userId);
  await redis.del(key);
}
