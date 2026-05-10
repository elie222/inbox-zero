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

  const nanoWeeklySpendLimitUsd = env.AI_NANO_WEEKLY_SPEND_LIMIT_USD ?? null;
  const nanoModelConfigured = !!env.NANO_LLM_PROVIDER && !!env.NANO_LLM_MODEL;
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
        nanoLimitedBySpendGuard:
          nanoLimiterEnabled &&
          nanoWeeklySpendLimitUsd !== null &&
          !hasUserApiKey &&
          spender.cost >= nanoWeeklySpendLimitUsd,
      };
    }),
  };
}
