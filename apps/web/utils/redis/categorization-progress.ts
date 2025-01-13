import { z } from "zod";
import { redis } from "@/utils/redis";

const categorizationProgressSchema = z.object({
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
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

export async function saveCategorizationTotalItems({
  userId,
  totalItems,
}: {
  userId: string;
  totalItems: number;
}) {
  const key = getKey(userId);
  const existingProgress = await getCategorizationProgress({ userId });
  await redis.set(
    key,
    {
      ...existingProgress,
      totalItems: (existingProgress?.totalItems || 0) + totalItems,
    },
    { ex: 2 * 60 },
  );
}

export async function saveCategorizationProgress({
  userId,
  incrementCompleted,
}: {
  userId: string;
  incrementCompleted: number;
}) {
  const existingProgress = await getCategorizationProgress({ userId });
  if (!existingProgress) return null;

  const key = getKey(userId);
  const updatedProgress: RedisCategorizationProgress = {
    ...existingProgress,
    completedItems: (existingProgress.completedItems || 0) + incrementCompleted,
  };

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
