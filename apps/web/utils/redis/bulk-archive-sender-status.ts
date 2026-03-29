import { z } from "zod";
import { redis } from "@/utils/redis";

const bulkArchiveSenderStatusSchema = z.object({
  status: z.enum(["completed"]),
  queued: z.boolean(),
  archivedCount: z.number().int().min(0).optional(),
});

const bulkArchiveSenderStatusesSchema = z.record(
  z.string(),
  bulkArchiveSenderStatusSchema,
);

export type BulkArchiveSenderStatus = z.infer<
  typeof bulkArchiveSenderStatusSchema
>;

const TTL_SECONDS = 5 * 60;

function getKey(emailAccountId: string) {
  return `bulk-archive-sender-status:${emailAccountId}`;
}

export async function getBulkArchiveSenderStatuses(emailAccountId: string) {
  const raw = await redis.get(getKey(emailAccountId));
  const parsed = bulkArchiveSenderStatusesSchema.safeParse(raw);
  if (!parsed.success) return {};
  return parsed.data;
}

export async function saveQueuedBulkArchiveSenderStatuses({
  emailAccountId,
  senders,
}: {
  emailAccountId: string;
  senders: string[];
}) {
  if (!senders.length) return {};

  const existing = await getBulkArchiveSenderStatuses(emailAccountId);
  const next = { ...existing };

  for (const sender of senders) {
    next[normalizeSender(sender)] = {
      status: "completed",
      queued: true,
    };
  }

  await redis.set(getKey(emailAccountId), next, { ex: TTL_SECONDS });
  return next;
}

export async function saveCompletedBulkArchiveSenderStatus({
  emailAccountId,
  sender,
  archivedCount,
}: {
  emailAccountId: string;
  sender: string;
  archivedCount: number;
}) {
  const existing = await getBulkArchiveSenderStatuses(emailAccountId);
  const next = {
    ...existing,
    [normalizeSender(sender)]: {
      status: "completed" as const,
      queued: false,
      archivedCount,
    },
  };

  await redis.set(getKey(emailAccountId), next, { ex: TTL_SECONDS });
  return next;
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}
