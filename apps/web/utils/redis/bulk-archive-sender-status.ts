import { z } from "zod";
import { redis } from "@/utils/redis";

const queuedBulkArchiveSenderStatusSchema = z.object({
  status: z.literal("queued"),
});

const processingBulkArchiveSenderStatusSchema = z.object({
  status: z.literal("processing"),
});

const completedBulkArchiveSenderStatusSchema = z.object({
  status: z.literal("completed"),
  archivedCount: z.number().int().min(0).optional(),
});

const failedBulkArchiveSenderStatusSchema = z.object({
  status: z.literal("failed"),
});

const bulkArchiveSenderStatusSchema = z.discriminatedUnion("status", [
  queuedBulkArchiveSenderStatusSchema,
  processingBulkArchiveSenderStatusSchema,
  completedBulkArchiveSenderStatusSchema,
  failedBulkArchiveSenderStatusSchema,
]);

export type BulkArchiveSenderStatus = z.infer<
  typeof bulkArchiveSenderStatusSchema
>;

const IN_PROGRESS_TTL_SECONDS = 5 * 60;
const FINAL_STATUS_TTL_SECONDS = 30;

function getKey(emailAccountId: string) {
  return `bulk-archive-sender-status:${emailAccountId}`;
}

export async function getBulkArchiveSenderStatuses(emailAccountId: string) {
  const raw = await redis.get(getKey(emailAccountId));
  return normalizeStatuses(raw);
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
    next[normalizeSender(sender)] = { status: "queued" };
  }

  await redis.set(getKey(emailAccountId), next, {
    ex: IN_PROGRESS_TTL_SECONDS,
  });
  return next;
}

export async function saveProcessingBulkArchiveSenderStatus({
  emailAccountId,
  sender,
}: {
  emailAccountId: string;
  sender: string;
}) {
  return saveSenderStatus({
    emailAccountId,
    sender,
    status: { status: "processing" },
    ttlSeconds: IN_PROGRESS_TTL_SECONDS,
  });
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
  return saveSenderStatus({
    emailAccountId,
    sender,
    status: { status: "completed", archivedCount },
    ttlSeconds: FINAL_STATUS_TTL_SECONDS,
  });
}

export async function saveFailedBulkArchiveSenderStatus({
  emailAccountId,
  sender,
}: {
  emailAccountId: string;
  sender: string;
}) {
  return saveSenderStatus({
    emailAccountId,
    sender,
    status: { status: "failed" },
    ttlSeconds: FINAL_STATUS_TTL_SECONDS,
  });
}

function normalizeStatuses(raw: unknown) {
  if (!raw || typeof raw !== "object") return {};

  const next: Record<string, BulkArchiveSenderStatus> = {};

  for (const [sender, status] of Object.entries(raw)) {
    const normalized = normalizeStatus(status);
    if (!normalized) continue;
    next[normalizeSender(sender)] = normalized;
  }

  return next;
}

function normalizeStatus(raw: unknown): BulkArchiveSenderStatus | null {
  const legacyQueued = z
    .object({
      status: z.literal("completed"),
      queued: z.literal(true),
    })
    .safeParse(raw);

  if (legacyQueued.success) {
    return { status: "queued" };
  }

  const parsed = bulkArchiveSenderStatusSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const legacyCompleted = z
    .object({
      status: z.literal("completed"),
      queued: z.boolean().optional(),
      archivedCount: z.number().int().min(0).optional(),
    })
    .safeParse(raw);

  if (legacyCompleted.success) {
    return {
      status: "completed",
      archivedCount: legacyCompleted.data.archivedCount,
    };
  }

  return null;
}

async function saveSenderStatus({
  emailAccountId,
  sender,
  status,
  ttlSeconds,
}: {
  emailAccountId: string;
  sender: string;
  status: BulkArchiveSenderStatus;
  ttlSeconds: number;
}) {
  const existing = await getBulkArchiveSenderStatuses(emailAccountId);
  const next = {
    ...existing,
    [normalizeSender(sender)]: status,
  };

  await redis.set(getKey(emailAccountId), next, { ex: ttlSeconds });
  return next;
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}
