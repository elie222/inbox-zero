import { HAS_ERROR_MESSAGES } from "@/utils/error-messages/query";
import prisma from "@/utils/prisma";
import type { AdminStatsParams } from "../types";
import { createAdminStatsRoute, resolveDateRange } from "../utils";

export type GetAdminOverviewResponse = Awaited<ReturnType<typeof getOverview>>;

export const GET = createAdminStatsRoute("admin/stats/overview", getOverview);

async function getOverview(params: AdminStatsParams) {
  const { from, to } = resolveDateRange(params);
  const now = new Date();

  const [
    totalUsers,
    newUsers,
    onboardedUsers,
    totalMailboxes,
    newMailboxes,
    disconnectedAccounts,
    healthyWatches,
    usersInErrorState,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.user.count({ where: { completedOnboardingAt: { not: null } } }),
    prisma.emailAccount.count(),
    prisma.emailAccount.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.account.count({ where: { disconnectedAt: { not: null } } }),
    prisma.emailAccount.count({
      where: { watchEmailsExpirationDate: { gt: now } },
    }),
    countUsersInErrorState(),
  ]);

  return {
    totalUsers,
    newUsers,
    onboardedUsers,
    totalMailboxes,
    newMailboxes,
    disconnectedAccounts,
    healthyWatches,
    usersInErrorState,
  };
}

/**
 * Users carrying a non-empty errorMessages blob.
 *
 * Shares the predicate with the errors page so the two cannot report
 * different numbers. It must imply User_errorMessages_updatedAt_idx from
 * 20260730190000_admin_dashboard_indexes for the partial index to be used.
 */
async function countUsersInErrorState() {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "User"
    WHERE ${HAS_ERROR_MESSAGES}
  `;

  return rows[0]?.count ?? 0;
}
