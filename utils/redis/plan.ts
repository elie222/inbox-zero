import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";
import { Action } from "@prisma/client";
// import { ACTIONS } from "@/utils/config";

export const planSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  action: z
    .enum([
      Action.ARCHIVE,
      Action.DRAFT_EMAIL,
      Action.FORWARD,
      Action.LABEL,
      Action.MARK_SPAM,
      Action.REPLY,
      Action.SEND_EMAIL,
      Action.SUMMARIZE,
      "ERROR",
    ])
    .nullish(),
  functionName: z.string(),
  functionArgs: z.any({}),
  createdAt: z.date(),
  // category: z.string().nullish(),
  // response: z.string().nullish(),
  // label: z.string().nullish(),
});
export type Plan = z.infer<typeof planSchema>;

function getKey(email: string) {
  return `plans:${email}`;
}
function getPlanKey(threadId: string) {
  return `plan:${threadId}`;
}

export async function getPlan(options: {
  userId: string;
  threadId: string;
}): Promise<Plan | null> {
  const key = getKey(options.userId);
  const planKey = getPlanKey(options.threadId);
  return redis.hget<Plan>(key, planKey);
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
