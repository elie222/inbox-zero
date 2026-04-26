import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  buildDateClause,
  createOrgStatsRoute,
  getOrgAnalyticsMemberFilter,
} from "../utils";
import type { OrgStatsParams } from "../types";

export type OrgTotalsResponse = Awaited<ReturnType<typeof getTotals>>;

export const GET = createOrgStatsRoute("organizations/stats/totals", getTotals);

async function getTotals({
  organizationId,
  fromDate,
  toDate,
}: OrgStatsParams & { organizationId: string }) {
  type TotalsResult = {
    total_emails: bigint;
    total_rules: bigint;
    active_members: bigint;
  };

  const emailDateClause = buildDateClause(Prisma.sql`em.date`, {
    fromDate,
    toDate,
  });
  const rulesDateClause = buildDateClause(Prisma.sql`er."createdAt"`, {
    fromDate,
    toDate,
  });
  const memberFilter = getOrgAnalyticsMemberFilter(organizationId);

  const result = await prisma.$queryRaw<TotalsResult[]>`
    SELECT
      (
        SELECT COUNT(*)
        FROM "EmailMessage" em
        JOIN "Member" m ON m."emailAccountId" = em."emailAccountId"
        WHERE ${memberFilter} AND em.sent = false${emailDateClause}
      ) as total_emails,
      (
        SELECT COUNT(*)
        FROM "ExecutedRule" er
        JOIN "Member" m ON m."emailAccountId" = er."emailAccountId"
        WHERE ${memberFilter}${rulesDateClause}
      ) as total_rules,
      (
        SELECT COUNT(DISTINCT m."emailAccountId")
        FROM "Member" m
        WHERE ${memberFilter}
      ) as active_members
  `;

  return {
    totalEmails: Number(result[0]?.total_emails ?? 0),
    totalRules: Number(result[0]?.total_rules ?? 0),
    activeMembers: Number(result[0]?.active_members ?? 0),
  };
}
