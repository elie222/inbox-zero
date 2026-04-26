import { z } from "zod";
import { redis } from "@/utils/redis";

const CATEGORIZATION_PROGRESS_TTL_SECONDS = 15 * 60;

const INCREMENT_PROGRESS_SCRIPT = `
local data = redis.call("GET", KEYS[1])
if not data then return nil end

local progress = cjson.decode(data)
local totalItems = tonumber(progress.totalItems) or 0
local increment = tonumber(ARGV[1])
local current = tonumber(progress.completedItems) or 0
local newCompleted = current + increment
if newCompleted > totalItems then newCompleted = totalItems end

progress.completedItems = newCompleted
if newCompleted >= totalItems then
  progress.status = "completed"
else
  progress.status = "running"
end
progress.updatedAt = ARGV[2]
if not progress.startedAt then progress.startedAt = ARGV[2] end

redis.call("SET", KEYS[1], cjson.encode(progress), "EX", ARGV[3])
return cjson.encode(progress)
`.trim();

const categorizationProgressCountsSchema = z.object({
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
});

const categorizationProgressSchema = categorizationProgressCountsSchema.extend({
  status: z.enum(["running", "completed"]),
  startedAt: z.string(),
  updatedAt: z.string(),
});

const legacyCategorizationProgressSchema = categorizationProgressCountsSchema;

type CategorizationProgress = z.infer<typeof categorizationProgressSchema>;
type StoredCategorizationProgress =
  | z.infer<typeof categorizationProgressSchema>
  | z.infer<typeof legacyCategorizationProgressSchema>;

export type CategorizationStatusSnapshot = {
  status: "idle" | "running" | "completed";
  totalItems: number;
  completedItems: number;
  remainingItems: number;
  message: string;
};

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `categorization-progress:${emailAccountId}`;
}

export async function getCategorizationProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  const progress = await redis.get<StoredCategorizationProgress>(key);
  if (!progress) return null;

  const parsedProgress = categorizationProgressSchema
    .or(legacyCategorizationProgressSchema)
    .safeParse(progress);

  if (!parsedProgress.success) return null;

  return normalizeCategorizationProgress(parsedProgress.data);
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
  const timestamp = new Date().toISOString();
  await redis.set(
    key,
    {
      totalItems,
      completedItems: existingProgress?.completedItems || 0,
      status: "running",
      startedAt: existingProgress?.startedAt || timestamp,
      updatedAt: timestamp,
    },
    { ex: CATEGORIZATION_PROGRESS_TTL_SECONDS },
  );
}

export async function saveCategorizationProgress({
  emailAccountId,
  incrementCompleted,
}: {
  emailAccountId: string;
  incrementCompleted: number;
}) {
  const key = getKey({ emailAccountId });
  const result = await redis.eval<string[], string | null>(
    INCREMENT_PROGRESS_SCRIPT,
    [key],
    [
      incrementCompleted.toString(),
      new Date().toISOString(),
      CATEGORIZATION_PROGRESS_TTL_SECONDS.toString(),
    ],
  );

  if (!result) return null;

  const parsed =
    typeof result === "string"
      ? (JSON.parse(result) as unknown)
      : (result as unknown);
  return categorizationProgressSchema.parse(parsed);
}

export async function deleteCategorizationProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  await redis.del(key);
}

export function getCategorizationStatusSnapshot(
  progress: CategorizationProgress | null,
): CategorizationStatusSnapshot {
  if (!progress) {
    return {
      status: "idle",
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      message: "Sender categorization has not started.",
    };
  }

  const completedItems = Math.min(progress.completedItems, progress.totalItems);
  const remainingItems = Math.max(progress.totalItems - completedItems, 0);

  if (progress.status === "completed" || remainingItems === 0) {
    return {
      status: "completed",
      totalItems: progress.totalItems,
      completedItems,
      remainingItems: 0,
      message:
        progress.totalItems > 0
          ? `Sender categorization completed for ${completedItems} senders.`
          : "Sender categorization completed.",
    };
  }

  return {
    status: "running",
    totalItems: progress.totalItems,
    completedItems,
    remainingItems,
    message: `Categorizing senders: ${completedItems} of ${progress.totalItems} completed.`,
  };
}

function normalizeCategorizationProgress(
  progress: StoredCategorizationProgress,
): CategorizationProgress {
  const completedItems = Math.min(progress.completedItems, progress.totalItems);
  const timestamp = new Date().toISOString();

  if (
    "status" in progress &&
    "startedAt" in progress &&
    "updatedAt" in progress
  ) {
    return {
      ...progress,
      completedItems,
    };
  }

  return {
    totalItems: progress.totalItems,
    completedItems,
    status: completedItems >= progress.totalItems ? "completed" : "running",
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}
