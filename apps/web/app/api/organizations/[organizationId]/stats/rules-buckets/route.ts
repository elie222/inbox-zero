import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";
import { Prisma } from "@/generated/prisma/client";
import { orgStatsParams, type GetOrgStatsOptions } from "../types";

export const RULES_BUCKETS = [
  { min: 500, label: "500+" },
  { min: 200, max: 500, label: "200-500" },
  { min: 100, max: 200, label: "100-200" },
  { min: 50, max: 100, label: "50-100" },
  { min: 0, max: 50, label: "<50" },
];

export type OrgRulesBucketsResponse = Awaited<
  ReturnType<typeof getExecutedRulesBuckets>
>;

export const GET = withAuth(
  "organizations/stats/rules-buckets",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const { searchParams } = new URL(request.url);
    const queryParams = orgStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getExecutedRulesBuckets({
      organizationId,
      fromDate: queryParams.fromDate ?? undefined,
      toDate: queryParams.toDate ?? undefined,
    });

    return NextResponse.json(result);
  },
);

async function getExecutedRulesBuckets({
  organizationId,
  fromDate,
  toDate,
}: GetOrgStatsOptions) {
  // Get executed rules count per member
  type MemberRulesCount = { emailAccountId: string; rules_count: bigint };

  // Build date conditions
  const dateConditions: Prisma.Sql[] = [];
  if (fromDate) {
    dateConditions.push(Prisma.sql`er."createdAt" >= ${new Date(fromDate)}`);
  }
  if (toDate) {
    dateConditions.push(Prisma.sql`er."createdAt" <= ${new Date(toDate)}`);
  }
  const dateClause =
    dateConditions.length > 0
      ? Prisma.sql` AND ${Prisma.join(dateConditions, " AND ")}`
      : Prisma.sql``;

  const memberCounts = await prisma.$queryRaw<MemberRulesCount[]>`
    SELECT er."emailAccountId", COUNT(*) as rules_count
    FROM "ExecutedRule" er
    JOIN "Member" m ON m."emailAccountId" = er."emailAccountId"
    WHERE m."organizationId" = ${organizationId}${dateClause}
    GROUP BY er."emailAccountId"
  `;

  // Bucket the results
  const bucketCounts = RULES_BUCKETS.map((bucket) => ({
    label: bucket.label,
    userCount: 0,
  }));

  for (const member of memberCounts) {
    const count = Number(member.rules_count);
    for (let i = 0; i < RULES_BUCKETS.length; i++) {
      const bucket = RULES_BUCKETS[i];
      if (
        count >= bucket.min &&
        (bucket.max === undefined || count < bucket.max)
      ) {
        bucketCounts[i].userCount++;
        break;
      }
    }
  }

  return bucketCounts;
}
