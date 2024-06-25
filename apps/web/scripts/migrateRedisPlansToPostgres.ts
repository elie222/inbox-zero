/* eslint-disable no-process-env */
// Run with: `npx tsx scripts/migrateRedisPlansToPostgres.ts`

import { z } from "zod";
import { ActionType, Prisma, PrismaClient } from "@prisma/client";
import { Redis } from "@upstash/redis";

const processedUserIds: string[] = [];

const prisma = new PrismaClient();

if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
  console.error("Missing Upstash Redis URL or token");
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

export const zodActionType = z.enum([
  ActionType.ARCHIVE,
  ActionType.DRAFT_EMAIL,
  ActionType.FORWARD,
  ActionType.LABEL,
  ActionType.MARK_SPAM,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
]);

const AI_GENERATE = "___AI_GENERATE___";

const planSchema = z.object({
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
  // createdAt: z.date(),
  reason: z.string().optional(),
  executed: z.boolean().optional(),
});
export type Plan = z.infer<typeof planSchema>;

async function migratePlansFromRedis() {
  // Get all user IDs from Redis
  const userIds = await redis.keys("plans:*");
  console.log("userIds:", userIds.length);

  for (const redisUserId of userIds) {
    const userId = redisUserId.replace("plans:", "");
    console.log("userId:", userId);

    await migrateUserPlans(userId);
  }

  console.log("Migration completed.");
}

async function migrateUserPlans(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    console.error(`User not found for user ${userId}`);
    processedUserIds.push(userId);
    console.log("Processed user IDs:", processedUserIds);
    return;
  }

  // Get all plans for the user from Redis
  const plans = await getPlans(userId);
  console.log("plans:", userId, plans?.length);

  if (!plans) {
    console.log(`No plans found for user ${userId}`);
    processedUserIds.push(userId);
    console.log("Processed user IDs:", processedUserIds);
    return;
  }

  const userRules = await prisma.rule.findMany({
    where: { userId },
    select: { id: true },
  });

  const threadIds = plans.map((plan) => plan.threadId);
  const existingPlans = await prisma.executedRule.findMany({
    where: {
      userId,
      threadId: { in: threadIds },
    },
    select: { messageId: true, threadId: true },
  });

  for (const [index, planData] of Object.entries(plans)) {
    if (Number.parseInt(index || "0") % 10 === 0)
      console.log("plan index:", userId, index);

    // Not sure why TS doesn't give me `data`. Quick hack to make it work.
    const { success } = planSchema.safeParse(planData);
    if (!success) {
      console.error(
        `Invalid plan data for user ${userId} and key ${index} and data: ${planData}`,
      );
      continue;
    }
    const plan = planSchema.parse(planData);

    const ruleExists =
      !plan.rule?.id ||
      (plan.rule?.id && userRules.some((r) => r.id === plan.rule?.id));

    if (!ruleExists) {
      console.log(
        `Rule ${plan.rule?.id} does not exist for user ${userId}. Skipping plan.`,
      );
      continue;
    }

    const exists = existingPlans.find(
      (p) => p.threadId === plan.threadId && p.messageId === plan.messageId,
    );

    if (exists) {
      console.log(
        `Plan already exists for user ${userId} and thread ${plan.threadId}`,
      );
      continue;
    }

    // save to db
    if (plan.rule) {
      try {
        await prisma.executedRule.create({
          data: {
            threadId: plan.threadId,
            messageId: plan.messageId,
            reason: plan.reason,
            ruleId: plan.rule?.id,
            userId,
            status: plan.executed ? "APPLIED" : "PENDING",
            automated: false,
            actionItems: {
              create: plan.rule?.actions.map((action) => ({
                type: action.type,
                label:
                  action.label === AI_GENERATE
                    ? plan.functionArgs.label
                    : action.label,
                subject:
                  action.subject === AI_GENERATE
                    ? plan.functionArgs.subject
                    : action.subject,
                content:
                  action.content === AI_GENERATE
                    ? plan.functionArgs.content
                    : action.content,
                to:
                  action.to === AI_GENERATE ? plan.functionArgs.to : action.to,
                cc:
                  action.cc === AI_GENERATE ? plan.functionArgs.cc : action.cc,
                bcc:
                  action.bcc === AI_GENERATE
                    ? plan.functionArgs.bcc
                    : action.bcc,
              })),
            },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003"
        ) {
          if (error.meta?.field_name === "ExecutedRule_ruleId_fkey (index)") {
            console.log(
              `Skipping plan for user ${userId} and thread ${plan.threadId} because rule ${plan.rule.id} does not exist in the database.`,
            );
          }
        } else {
          throw error;
        }
      }
    } else {
      const data = {
        threadId: plan.threadId,
        messageId: plan.messageId,
        status: "SKIPPED" as const,
        automated: false,
        userId,
      };
      await prisma.executedRule.create({ data });
    }
  }

  processedUserIds.push(userId);
  console.log("Processed user IDs:", processedUserIds);
  console.log("Migration completed for", userId);
}

async function getPlans(userId: string) {
  try {
    return await getFilteredPlans({ userId });
    // return await redis.hgetall(`plans:${userId}`);
  } catch (error) {
    console.error("Error for", userId, error);
  }
}

// to avoid fetching too much data from Redis
export async function getFilteredPlans({
  userId,
  count = 50_000,
  filter,
}: {
  userId: string;
  filter?: (plan: Plan) => boolean;
  count?: number;
}): Promise<(Plan & { id: string })[]> {
  const key = `plans:${userId}`;
  let cursor = "0";
  const results: [string, Plan][] = [];

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
        cursor = "0"; // Reset cursor to end the loop
        break;
      }
    }
  } while (cursor !== "0");

  return results.map(([planId, plan]) => ({ ...plan, id: planId }));
}

migratePlansFromRedis()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    console.log("Processed user IDs:", processedUserIds);
    await prisma.$disconnect();
  });
