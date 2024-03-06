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
        }),
      ),
    })
    .or(z.null()),
  createdAt: z.date(),
  reason: z.string().optional(),
  // category: z.string().nullish(),
  // response: z.string().nullish(),
  // label: z.string().nullish(),
  executed: z.boolean().optional(),
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

// runs into issues with large datasets
// export async function getPlans(options: {
//   userId: string;
// }): Promise<(Plan & { id: string })[]> {
//   const key = getKey(options.userId);
//   const plans = await redis.hgetall<Record<string, Plan>>(key);

//   return Object.entries(plans || {}).map(([planId, plan]) => ({
//     ...plan,
//     id: planId,
//   }));
// }

// to avoid fetching too much data from Redis
export async function getFilteredPlans({
  userId,
  count = 50,
  filter,
}: {
  userId: string;
  filter?: (plan: Plan) => boolean;
  count?: number;
}): Promise<(Plan & { id: string })[]> {
  const key = getKey(userId);
  let cursor = 0;
  let results: [string, Plan][] = [];

  do {
    const reply = await redis.hscan(key, cursor, { count });
    cursor = reply[0];
    const pairs = reply[1];

    for (let i = 0; i < pairs.length; i += 2) {
      const planId = pairs[i] as string;
      const planData = pairs[i + 1] as unknown as Plan;

      if (!filter || filter(planData)) results.push([planId, planData]);

      // Break if we have collected enough data
      if (results.length >= count) {
        cursor = 0; // Reset cursor to end the loop
        break;
      }
    }
  } while (cursor !== 0);

  return results.map(([planId, plan]) => ({ ...plan, id: planId }));
}

export async function savePlan(options: {
  userId: string;
  threadId: string;
  plan: Plan;
}) {
  const key = getKey(options.userId);
  const planKey = getPlanKey(options.threadId);
  redis.hset(key, { [planKey]: options.plan });
  redis.expire(key, 60 * 60 * 24 * 7); // 1 week
}

export async function markPlanExecuted(options: {
  userId: string;
  threadId: string;
}) {
  const plan = await getPlan(options);
  if (!plan) return;
  return savePlan({ ...options, plan: { ...plan, executed: true } });
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
