import { z } from "zod";
import { redis } from "@/utils/redis";

const categorizationProgressSchema = z.object({
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
});
type RedisCategorizationProgress = z.infer<typeof categorizationProgressSchema>;

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `categorization-progress:${emailAccountId}`;
}

export async function getCategorizationProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  const progress = await redis.get<RedisCategorizationProgress>(key);
  if (!progress) return null;
  return progress;
}

export async function saveCategorizationTotalItems({
  emailAccountId,
  totalItems,
}: {
  emailAccountId: string;
  totalItems: number;
}) {
  const key = getKey({ emailAccountId });
  const existingProgress = await getCategorizationProgress({ emailAccountId });
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
  emailAccountId,
  incrementCompleted,
}: {
  emailAccountId: string;
  incrementCompleted: number;
}) {
  const existingProgress = await getCategorizationProgress({ emailAccountId });
  if (!existingProgress) return null;

  const key = getKey({ emailAccountId });
  const updatedProgress: RedisCategorizationProgress = {
    ...existingProgress,
    completedItems: (existingProgress.completedItems || 0) + incrementCompleted,
  };

  // Store progress for 2 minutes
  await redis.set(key, updatedProgress, { ex: 2 * 60 });
  return updatedProgress;
}
