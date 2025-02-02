import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

const redisLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
});
export type RedisLabel = z.infer<typeof redisLabelSchema>;

function getUserLabelsKey(email: string) {
  return `labels:user:${email}`;
}

// user labels
async function getUserLabels(options: { email: string }) {
  const key = getUserLabelsKey(options.email);
  return redis.get<RedisLabel[]>(key);
}

export async function saveUserLabel(options: {
  email: string;
  label: RedisLabel;
}) {
  const existingLabels = await getUserLabels(options);
  const newLabels = [...(existingLabels ?? []), options.label];
  return saveUserLabels({ email: options.email, labels: newLabels });
}

export async function saveUserLabels(options: {
  email: string;
  labels: RedisLabel[];
}) {
  const key = getUserLabelsKey(options.email);
  return redis.set(key, options.labels);
}

export async function deleteUserLabels(options: { email: string }) {
  const key = getUserLabelsKey(options.email);
  return redis.del(key);
}

// inbox zero labels
function getInboxZeroLabelsKey(email: string) {
  return `labels:inboxzero:${email}`;
}

export async function deleteInboxZeroLabels(options: { email: string }) {
  const key = getInboxZeroLabelsKey(options.email);
  return redis.del(key);
}
