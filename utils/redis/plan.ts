import "server-only";
import { z } from "zod";
import { redis } from "@/utils/redis";
import { ActionType } from "@prisma/client";

export const planSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  functionArgs: z.any({}),
  rule: z.object({
    actions: z.array(
      z.object({
        type: z.enum([
          ActionType.ARCHIVE,
          ActionType.DRAFT_EMAIL,
          ActionType.FORWARD,
          ActionType.LABEL,
          ActionType.MARK_SPAM,
          ActionType.REPLY,
          ActionType.SEND_EMAIL,
          ActionType.SUMMARIZE,
        ]),
        label: z.string().nullish(),
        subject: z.string().nullish(),
        content: z.string().nullish(),
        to: z.string().nullish(),
        cc: z.string().nullish(),
        bcc: z.string().nullish(),
      })
    ),
  }),
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

export async function getPlans(options: { userId: string }): Promise<Plan[]> {
  const key = getKey(options.userId);
  const plans = await redis.hgetall<Record<string, Plan>>(key);

  return Object.values(plans || {});
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
