import 'server-only';
import { z } from 'zod';
import { redis } from '@/utils/redis';

export const planSchema = z.object({
  category: z.string().nullish(),
  action: z.string().nullish(),
  response: z.string().nullish(),
  label: z.string().nullish(),
});
export type Plan = z.infer<typeof planSchema>;

function getPlanKey(threadId: string) {
  return `plan:${threadId}`;
}

export async function getPlan(options: { threadId: string }) {
  const key = getPlanKey(options.threadId)
  const data = await redis.get<Plan>(key);
  return data;
}

export async function savePlan(options: { threadId: string, plan: Plan }) {
  const key = getPlanKey(options.threadId)
  return await redis.set(key, options.plan);
}
