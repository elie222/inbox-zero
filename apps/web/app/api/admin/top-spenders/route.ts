import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { withAdmin } from "@/utils/middleware";
import { getTopWeeklyUsageCosts } from "@/utils/redis/usage";

export type GetAdminTopSpendersResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAdmin("admin/top-spenders", async () => {
  const result = await getData();
  return NextResponse.json(result);
});

async function getData() {
  const topSpenders = await getTopWeeklyUsageCosts({ limit: 25 });
  if (!topSpenders.length) return { topSpenders: [] };

  const emails = topSpenders.map((spender) => spender.email);
  const emailAccounts = await prisma.emailAccount.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, userId: true },
  });

  const userIds = [...new Set(emailAccounts.map((account) => account.userId))];
  const usersWithApiKey = userIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: userIds },
          AND: [{ aiApiKey: { not: null } }, { aiApiKey: { not: "" } }],
        },
        select: { id: true },
      })
    : [];

  const emailAccountByEmail = new Map(
    emailAccounts.map((account) => [account.email, account]),
  );
  const userIdsWithApiKey = new Set(usersWithApiKey.map((user) => user.id));

  const nanoWeeklySpendLimitUsd = env.AI_NANO_WEEKLY_SPEND_LIMIT_USD ?? null;
  const nanoModelConfigured = !!env.NANO_LLM_PROVIDER && !!env.NANO_LLM_MODEL;
  const nanoLimiterEnabled =
    nanoWeeklySpendLimitUsd !== null && nanoModelConfigured;

  return {
    topSpenders: topSpenders.map((spender) => {
      const emailAccount = emailAccountByEmail.get(spender.email);
      const hasUserApiKey = emailAccount
        ? userIdsWithApiKey.has(emailAccount.userId)
        : false;

      return {
        ...spender,
        emailAccountId: emailAccount?.id ?? null,
        nanoLimitedBySpendGuard:
          nanoLimiterEnabled &&
          nanoWeeklySpendLimitUsd !== null &&
          !hasUserApiKey &&
          spender.cost >= nanoWeeklySpendLimitUsd,
      };
    }),
  };
}
