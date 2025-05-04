import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

const redisLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
});
export type RedisLabel = z.infer<typeof redisLabelSchema>;

function getUserLabelsKey({ emailAccountId }: { emailAccountId: string }) {
  return `labels:user:${emailAccountId}`;
}

// user labels
async function getUserLabels({ emailAccountId }: { emailAccountId: string }) {
  const key = getUserLabelsKey({ emailAccountId });
  return redis.get<RedisLabel[]>(key);
}

export async function saveUserLabel(options: {
  emailAccountId: string;
  label: RedisLabel;
}) {
  const existingLabels = await getUserLabels(options);
  const newLabels = [...(existingLabels ?? []), options.label];
  return saveUserLabels({
    emailAccountId: options.emailAccountId,
    labels: newLabels,
  });
}

export async function saveUserLabels({
  emailAccountId,
  labels,
}: {
  emailAccountId: string;
  labels: RedisLabel[];
}) {
  const key = getUserLabelsKey({ emailAccountId });
  return redis.set(key, labels);
}

export async function deleteUserLabels({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getUserLabelsKey({ emailAccountId });
  return redis.del(key);
}

// inbox zero labels
function getInboxZeroLabelsKey({ emailAccountId }: { emailAccountId: string }) {
  return `labels:inboxzero:${emailAccountId}`;
}

export async function deleteInboxZeroLabels({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getInboxZeroLabelsKey({ emailAccountId });
  return redis.del(key);
}
