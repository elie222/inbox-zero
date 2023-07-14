import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";

export const planSchema = z.object({
  category: z.string().nullish(),
  action: z.enum(["archive", "label", "respond", "error"]).nullish(),
  response: z.string().nullish(),
  label: z.string().nullish(),
});
export type Plan = z.infer<typeof planSchema>;

function getPlanKey(threadId: string) {
  return `plan:${threadId}`;
}

export async function getPlan(options: { email: string; threadId: string }) {
  const key = getPlanKey(options.threadId);
  return redis.hget<Plan>(options.email, key);
}

export async function savePlan(options: {
  email: string;
  threadId: string;
  plan: Plan;
}) {
  const key = getPlanKey(options.threadId);
  return redis.hset(options.email, { [key]: options.plan });
}

export async function deletePlans(options: { email: string }) {
  return redis.del(options.email);
}
