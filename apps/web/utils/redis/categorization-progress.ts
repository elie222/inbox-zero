import { z } from "zod";
import { redis } from "@/utils/redis";

const categorizationProgressSchema = z.object({
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
});
type RedisCategorizationProgress = z.infer<typeof categorizationProgressSchema>;

function getKey({ email }: { email: string }) {
  return `categorization-progress:${email}`;
}

export async function getCategorizationProgress({
  email,
}: {
  email: string;
}) {
  const key = getKey({ email });
  const progress = await redis.get<RedisCategorizationProgress>(key);
  if (!progress) return null;
  return progress;
}

export async function saveCategorizationTotalItems({
  email,
  totalItems,
}: {
  email: string;
  totalItems: number;
}) {
  const key = getKey({ email });
  const existingProgress = await getCategorizationProgress({ email });
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
  email,
  incrementCompleted,
}: {
  email: string;
  incrementCompleted: number;
}) {
  const existingProgress = await getCategorizationProgress({ email });
  if (!existingProgress) return null;

  const key = getKey({ email });
  const updatedProgress: RedisCategorizationProgress = {
    ...existingProgress,
    completedItems: (existingProgress.completedItems || 0) + incrementCompleted,
  };

  // Store progress for 2 minutes
  await redis.set(key, updatedProgress, { ex: 2 * 60 });
  return updatedProgress;
}
