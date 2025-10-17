import { z } from "zod";
import { redis } from "@/utils/redis";

export type BulkOperationType = "archive" | "mark-read";

const bulkOperationProgressSchema = z.object({
  operationType: z.enum(["archive", "mark-read"]),
  categoryOrSender: z.string(), // category name or sender email
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
  failedItems: z.number().int().min(0),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RedisBulkOperationProgress = z.infer<
  typeof bulkOperationProgressSchema
>;

function getKey({
  emailAccountId,
  operationId,
}: {
  emailAccountId: string;
  operationId: string;
}) {
  return `bulk-operation-progress:${emailAccountId}:${operationId}`;
}

export async function getBulkOperationProgress({
  emailAccountId,
  operationId,
}: {
  emailAccountId: string;
  operationId: string;
}) {
  const key = getKey({ emailAccountId, operationId });
  const progress = await redis.get<RedisBulkOperationProgress>(key);
  return progress;
}

export async function createBulkOperation({
  emailAccountId,
  operationId,
  operationType,
  categoryOrSender,
  totalItems,
}: {
  emailAccountId: string;
  operationId: string;
  operationType: BulkOperationType;
  categoryOrSender: string;
  totalItems: number;
}) {
  const key = getKey({ emailAccountId, operationId });
  const now = new Date().toISOString();

  const progress: RedisBulkOperationProgress = {
    operationType,
    categoryOrSender,
    totalItems,
    completedItems: 0,
    failedItems: 0,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  // Store progress for 10 minutes
  await redis.set(key, progress, { ex: 10 * 60 });
  return progress;
}

export async function updateBulkOperationProgress({
  emailAccountId,
  operationId,
  incrementCompleted = 0,
  incrementFailed = 0,
  status,
}: {
  emailAccountId: string;
  operationId: string;
  incrementCompleted?: number;
  incrementFailed?: number;
  status?: RedisBulkOperationProgress["status"];
}) {
  const existingProgress = await getBulkOperationProgress({
    emailAccountId,
    operationId,
  });
  if (!existingProgress) return null;

  const key = getKey({ emailAccountId, operationId });
  const updatedProgress: RedisBulkOperationProgress = {
    ...existingProgress,
    completedItems: existingProgress.completedItems + incrementCompleted,
    failedItems: existingProgress.failedItems + incrementFailed,
    status: status || existingProgress.status,
    updatedAt: new Date().toISOString(),
  };

  // Auto-complete if all items are processed
  if (
    updatedProgress.completedItems + updatedProgress.failedItems >=
    updatedProgress.totalItems
  ) {
    updatedProgress.status = "completed";
  }

  // Store progress for 10 minutes
  await redis.set(key, updatedProgress, { ex: 10 * 60 });
  return updatedProgress;
}

export async function getAllBulkOperations({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<Array<RedisBulkOperationProgress & { operationId: string }>> {
  const pattern = `bulk-operation-progress:${emailAccountId}:*`;
  const keys = await redis.keys(pattern);

  if (keys.length === 0) return [];

  const operations = await Promise.all(
    keys.map(async (key) => {
      const operationId = key.split(":").pop()!;
      const progress = await redis.get<RedisBulkOperationProgress>(key);
      if (!progress) return null;
      return { ...progress, operationId };
    }),
  );

  return operations.filter(
    (op): op is RedisBulkOperationProgress & { operationId: string } =>
      op !== null,
  );
}
