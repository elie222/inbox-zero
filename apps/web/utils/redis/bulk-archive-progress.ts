import { z } from "zod";
import { redis } from "@/utils/redis";

const bulkArchiveProgressSchema = z.object({
  totalItems: z.coerce.number().int().min(0),
  completedItems: z.coerce.number().int().min(0),
});

type RedisBulkArchiveProgress = z.infer<typeof bulkArchiveProgressSchema>;

const IN_PROGRESS_TTL_SECONDS = 5 * 60;
const COMPLETED_TTL_SECONDS = 30;

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `bulk-archive-progress:${emailAccountId}`;
}

export async function getBulkArchiveProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const progress = await redis.hgetall<RedisBulkArchiveProgress>(
    getKey({ emailAccountId }),
  );
  if (!progress) return null;

  const parsedProgress = bulkArchiveProgressSchema.safeParse(progress);
  if (!parsedProgress.success) return null;

  return parsedProgress.data;
}

export async function saveBulkArchiveTotalItems({
  emailAccountId,
  totalItems,
}: {
  emailAccountId: string;
  totalItems: number;
}) {
  if (totalItems <= 0) return null;

  const existingProgress = await getBulkArchiveProgress({ emailAccountId });
  const shouldResetProgress =
    !existingProgress ||
    existingProgress.completedItems >= existingProgress.totalItems;

  const nextProgress: RedisBulkArchiveProgress = shouldResetProgress
    ? {
        totalItems,
        completedItems: 0,
      }
    : {
        totalItems: existingProgress.totalItems + totalItems,
        completedItems: existingProgress.completedItems,
      };

  if (shouldResetProgress) {
    await redis.hset(getKey({ emailAccountId }), nextProgress);
  } else {
    await redis.hincrby(getKey({ emailAccountId }), "totalItems", totalItems);
  }

  await redis.expire(getKey({ emailAccountId }), IN_PROGRESS_TTL_SECONDS);

  return nextProgress;
}

export async function saveBulkArchiveProgress({
  emailAccountId,
  incrementCompleted,
}: {
  emailAccountId: string;
  incrementCompleted: number;
}) {
  if (incrementCompleted <= 0) return null;

  const existingProgress = await getBulkArchiveProgress({ emailAccountId });
  if (!existingProgress) return null;

  const completedItems = Math.min(
    await redis.hincrby(
      getKey({ emailAccountId }),
      "completedItems",
      incrementCompleted,
    ),
    existingProgress.totalItems,
  );

  if (completedItems < existingProgress.completedItems + incrementCompleted) {
    await redis.hset(getKey({ emailAccountId }), {
      completedItems,
    });
  }

  await redis.expire(
    getKey({ emailAccountId }),
    completedItems >= existingProgress.totalItems
      ? COMPLETED_TTL_SECONDS
      : IN_PROGRESS_TTL_SECONDS,
  );

  return {
    totalItems: existingProgress.totalItems,
    completedItems,
  };
}
