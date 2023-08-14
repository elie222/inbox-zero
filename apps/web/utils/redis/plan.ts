import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";
import { zodActionType } from "@/app/api/user/rules/[id]/validation";

export const planSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  functionArgs: z.any({}),
  rule: z
    .object({
      id: z.string(),
      name: z.string(),
      actions: z.array(
        z.object({
          type: zodActionType,
          label: z.string().nullish(),
          subject: z.string().nullish(),
          content: z.string().nullish(),
          to: z.string().nullish(),
          cc: z.string().nullish(),
          bcc: z.string().nullish(),
        })
      ),
    })
    .or(z.null()),
  createdAt: z.date(),
  // category: z.string().nullish(),
  // response: z.string().nullish(),
  // label: z.string().nullish(),
});
export type Plan = z.infer<typeof planSchema>;

function getKey(userId: string) {
  return `plans:${userId}`;
}
function getPlanKey(threadId: string) {
  return `plan:${threadId}`;
}

export async function getPlan(options: {
  userId: string;
  threadId: string;
}): Promise<(Plan & { id: string }) | null> {
  const key = getKey(options.userId);
  const planKey = getPlanKey(options.threadId);
  const plan = await redis.hget<Plan>(key, planKey);
  if (!plan) return null;
  return { ...plan, id: planKey };
}

export async function getPlans(options: {
  userId: string;
}): Promise<(Plan & { id: string })[]> {
  const key = getKey(options.userId);
  const plans = await redis.hgetall<Record<string, Plan>>(key);

  return Object.entries(plans || {}).map(([planId, plan]) => ({
    ...plan,
    id: planId,
  }));
}

export async function savePlan(options: {
  userId: string;
  threadId: string;
  plan: Plan;
}) {
  const key = getKey(options.userId);
  const planKey = getPlanKey(options.threadId);
  return redis.hset(key, { [planKey]: options.plan });
}

export async function deletePlan(options: {
  userId: string;
  threadId: string;
}) {
  const key = getKey(options.userId);
  const planKey = getPlanKey(options.threadId);
  return redis.hdel(key, planKey);
}

export async function deletePlans(options: { userId: string }) {
  const key = getKey(options.userId);
  return redis.del(key);
}
