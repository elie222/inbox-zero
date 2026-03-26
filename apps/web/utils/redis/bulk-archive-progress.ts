import { z } from "zod";
import { redis } from "@/utils/redis";

const bulkArchiveProgressSchema = z.object({
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
});

type RedisBulkArchiveProgress = z.infer<typeof bulkArchiveProgressSchema>;

const IN_PROGRESS_TTL_SECONDS = 5 * 60;
const COMPLETED_TTL_SECONDS = 5;

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `bulk-archive-progress:${emailAccountId}`;
}

export async function getBulkArchiveProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const progress = await redis.get<RedisBulkArchiveProgress>(
    getKey({ emailAccountId }),
  );
  if (!progress) return null;
  return progress;
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

  await redis.set(getKey({ emailAccountId }), nextProgress, {
    ex: IN_PROGRESS_TTL_SECONDS,
  });

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
    existingProgress.completedItems + incrementCompleted,
    existingProgress.totalItems,
  );
  const nextProgress: RedisBulkArchiveProgress = {
    totalItems: existingProgress.totalItems,
    completedItems,
  };

  await redis.set(getKey({ emailAccountId }), nextProgress, {
    ex:
      completedItems >= existingProgress.totalItems
        ? COMPLETED_TTL_SECONDS
        : IN_PROGRESS_TTL_SECONDS,
  });

  return nextProgress;
}
