import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { withAdmin } from "@/utils/middleware";
import {
  getTopWeeklyUsageCosts,
  getWeeklyUsageCostWindow,
} from "@/utils/redis/usage";
import { createScopedLogger } from "@/utils/logger";
import {
  getAdminAiModelSpendByPeriod,
  getAdminAiUserModelSpendByPeriod,
} from "@inboxzero/tinybird-ai-analytics";

export type GetAdminTopSpendersResponse = Awaited<ReturnType<typeof getData>>;

const logger = createScopedLogger("admin/top-spenders");
const TOP_SPENDER_LIMIT = 25;
const MODEL_SPEND_LIMIT = 25;
const USER_MODEL_SPEND_LIMIT = 3;

export const GET = withAdmin("admin/top-spenders", async () => {
  const result = await getData();
  return NextResponse.json(result);
});

async function getData() {
  const now = new Date();
  const { startTimestampMs, endTimestampMs } = getWeeklyUsageCostWindow(now);
  const [topSpenders, modelSpend] = await Promise.all([
    getTopWeeklyUsageCosts({ limit: TOP_SPENDER_LIMIT, now }),
    getModelSpend({ startTimestampMs, endTimestampMs }),
  ]);

  const emails = topSpenders.flatMap((spender) =>
    "email" in spender ? [spender.email] : [],
  );
  const emailAccounts = emails.length
    ? await prisma.emailAccount.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, userId: true },
      })
    : [];

  const userIds = [
    ...new Set([
      ...topSpenders.flatMap((spender) =>
        "userId" in spender ? [spender.userId] : [],
      ),
      ...emailAccounts.map((account) => account.userId),
    ]),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          email: true,
          aiApiKey: true,
          emailAccounts: {
            select: { id: true, email: true },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : [];

  const emailAccountByEmail = new Map(
    emailAccounts.map((account) => [account.email, account]),
  );
  const usersById = new Map(users.map((user) => [user.id, user]));
  const userModelSpend = await getUserModelSpend({
    userIds,
    startTimestampMs,
    endTimestampMs,
  });
  const userModelSpendByUserId = groupUserModelSpendByUserId(userModelSpend);

  const nanoWeeklySpendLimitUsd = env.AI_NANO_WEEKLY_SPEND_LIMIT_USD ?? null;
  const nanoModelConfigured = !!env.NANO_LLMS;
  const nanoLimiterEnabled =
    nanoWeeklySpendLimitUsd !== null && nanoModelConfigured;

  return {
    topSpenders: topSpenders.map((spender) => {
      const emailAccount =
        "email" in spender ? emailAccountByEmail.get(spender.email) : null;
      const userId =
        "userId" in spender ? spender.userId : emailAccount?.userId;
      const user = userId ? usersById.get(userId) : null;
      const hasUserApiKey = !!user?.aiApiKey;
      const primaryEmailAccount = emailAccount ?? user?.emailAccounts[0];

      return {
        ...spender,
        email: "email" in spender ? spender.email : (user?.email ?? null),
        emailAccountId: primaryEmailAccount?.id ?? null,
        userEmailAccountCount: user?.emailAccounts.length ?? 0,
        modelSpend: userId ? (userModelSpendByUserId.get(userId) ?? []) : [],
        nanoLimitedBySpendGuard:
          nanoLimiterEnabled &&
          nanoWeeklySpendLimitUsd !== null &&
          !hasUserApiKey &&
          spender.cost >= nanoWeeklySpendLimitUsd,
      };
    }),
    modelSpend,
  };
}

async function getModelSpend(options: {
  startTimestampMs: number;
  endTimestampMs: number;
}) {
  try {
    return await getAdminAiModelSpendByPeriod({
      ...options,
      limit: MODEL_SPEND_LIMIT,
    });
  } catch (error) {
    logger.error("Failed to load admin model spend", { error });
    return [];
  }
}

async function getUserModelSpend(options: {
  userIds: string[];
  startTimestampMs: number;
  endTimestampMs: number;
}) {
  try {
    return await getAdminAiUserModelSpendByPeriod({
      ...options,
      perUserLimit: USER_MODEL_SPEND_LIMIT,
    });
  } catch (error) {
    logger.error("Failed to load admin user model spend", { error });
    return [];
  }
}

function groupUserModelSpendByUserId<T extends { userId: string }>(
  userModelSpend: T[],
) {
  const userModelSpendByUserId = new Map<string, T[]>();

  for (const spend of userModelSpend) {
    const current = userModelSpendByUserId.get(spend.userId) ?? [];
    current.push(spend);
    userModelSpendByUserId.set(spend.userId, current);
  }

  return userModelSpendByUserId;
}
