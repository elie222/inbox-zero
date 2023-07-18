import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

const redisLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
});
export type RedisLabel = z.infer<typeof redisLabelSchema>;

function getKey(email: string) {
  return `labels:${email}`;
}

export async function getLabels(options: { email: string }) {
  const key = getKey(options.email);
  return redis.get<RedisLabel[]>(key);
}

export async function saveLabels(options: {
  email: string;
  labels: RedisLabel[];
}) {
  const key = getKey(options.email);
  return redis.set(key, options.labels);
}

export async function deleteLabels(options: { email: string }) {
  const key = getKey(options.email);
  return redis.del(key);
}
