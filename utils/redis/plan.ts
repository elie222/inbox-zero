import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

export const planSchema = z.object({
  category: z.string().nullish(),
  action: z.enum(["archive", "label", "reply", "to_do", "error"]).nullish(),
  response: z.string().nullish(),
  label: z.string().nullish(),
});
export type Plan = z.infer<typeof planSchema>;

function getKey(email: string) {
  return `plans:${email}`;
}
function getPlanKey(threadId: string) {
  return `plan:${threadId}`;
}

export async function getPlan(options: { email: string; threadId: string }): Promise<Plan | null> {
  const key = getKey(options.email);
  const planKey = getPlanKey(options.threadId);
  return redis.hget<Plan>(key, planKey);
}

export async function savePlan(options: {
  email: string;
  threadId: string;
  plan: Plan;
}) {
  const key = getKey(options.email);
  const planKey = getPlanKey(options.threadId);
  return redis.hset(key, { [planKey]: options.plan });
}

export async function deletePlans(options: { email: string }) {
  const key = getKey(options.email);
  return redis.del(key);
}
