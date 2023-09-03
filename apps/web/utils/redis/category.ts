import { z } from "zod";
import { redis } from "@/utils/redis";

const categorySchema = z.object({
  category: z.string(),
});
export type RedisCategory = z.infer<typeof categorySchema>;

function getKey(email: string) {
  return `categories:${email}`;
}
function getCategoryKey(threadId: string) {
  return `category:${threadId}`;
}

export async function getCategory(options: {
  email: string;
  threadId: string;
}) {
  const key = getKey(options.email);
  const categoryKey = getCategoryKey(options.threadId);
  const category = await redis.hget<RedisCategory>(key, categoryKey);
  if (!category) return null;
  return { ...category, id: categoryKey };
}

export async function saveCategory(options: {
  email: string;
  threadId: string;
  category: RedisCategory;
}) {
  const key = getKey(options.email);
  const categoryKey = getCategoryKey(options.threadId);
  return redis.hset(key, { [categoryKey]: options.category });
}

export async function deleteCategory(options: {
  email: string;
  threadId: string;
}) {
  const key = getKey(options.email);
  const categoryKey = getCategoryKey(options.threadId);
  return redis.hdel(key, categoryKey);
}

export async function deleteCategories(options: { email: string }) {
  const key = getKey(options.email);
  return redis.del(key);
}
