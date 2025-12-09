import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";
import { Prisma } from "@/generated/prisma/client";
import { orgStatsParams, type GetOrgStatsOptions } from "../types";

export type OrgTotalsResponse = Awaited<ReturnType<typeof getTotals>>;

export const GET = withAuth(
  "organizations/stats/totals",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const { searchParams } = new URL(request.url);
    const queryParams = orgStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getTotals({
      organizationId,
      fromDate: queryParams.fromDate ?? undefined,
      toDate: queryParams.toDate ?? undefined,
    });

    return NextResponse.json(result);
  },
);

async function getTotals({
  organizationId,
  fromDate,
  toDate,
}: GetOrgStatsOptions) {
  type TotalsResult = {
    total_emails: bigint;
    total_rules: bigint;
    active_members: bigint;
  };

  // Build date conditions for emails
  const emailDateConditions: Prisma.Sql[] = [];
  if (fromDate) {
    emailDateConditions.push(Prisma.sql`em.date >= ${new Date(fromDate)}`);
  }
  if (toDate) {
    emailDateConditions.push(Prisma.sql`em.date <= ${new Date(toDate)}`);
  }
  const emailDateClause =
    emailDateConditions.length > 0
      ? Prisma.sql` AND ${Prisma.join(emailDateConditions, " AND ")}`
      : Prisma.sql``;

  // Build date conditions for rules
  const rulesDateConditions: Prisma.Sql[] = [];
  if (fromDate) {
    rulesDateConditions.push(
      Prisma.sql`er."createdAt" >= ${new Date(fromDate)}`,
    );
  }
  if (toDate) {
    rulesDateConditions.push(Prisma.sql`er."createdAt" <= ${new Date(toDate)}`);
  }
  const rulesDateClause =
    rulesDateConditions.length > 0
      ? Prisma.sql` AND ${Prisma.join(rulesDateConditions, " AND ")}`
      : Prisma.sql``;

  const result = await prisma.$queryRaw<TotalsResult[]>`
    SELECT
      (
        SELECT COUNT(*)
        FROM "EmailMessage" em
        JOIN "Member" m ON m."emailAccountId" = em."emailAccountId"
        WHERE m."organizationId" = ${organizationId} AND em.sent = false${emailDateClause}
      ) as total_emails,
      (
        SELECT COUNT(*)
        FROM "ExecutedRule" er
        JOIN "Member" m ON m."emailAccountId" = er."emailAccountId"
        WHERE m."organizationId" = ${organizationId}${rulesDateClause}
      ) as total_rules,
      (
        SELECT COUNT(DISTINCT m."emailAccountId")
        FROM "Member" m
        WHERE m."organizationId" = ${organizationId}
      ) as active_members
  `;

  return {
    totalEmails: Number(result[0]?.total_emails ?? 0),
    totalRules: Number(result[0]?.total_rules ?? 0),
    activeMembers: Number(result[0]?.active_members ?? 0),
  };
}
