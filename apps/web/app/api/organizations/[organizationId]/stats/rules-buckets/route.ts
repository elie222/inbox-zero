import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  bucketMemberCounts,
  buildDateClause,
  createOrgStatsRoute,
  getOrgAnalyticsMemberFilter,
} from "../utils";
import type { OrgStatsParams } from "../types";

export type OrgRulesBucketsResponse = Awaited<
  ReturnType<typeof getExecutedRulesBuckets>
>;

export const GET = createOrgStatsRoute(
  "organizations/stats/rules-buckets",
  getExecutedRulesBuckets,
);

async function getExecutedRulesBuckets({
  organizationId,
  fromDate,
  toDate,
}: OrgStatsParams & { organizationId: string }) {
  type MemberRulesCount = { emailAccountId: string; rules_count: bigint };

  const dateClause = buildDateClause(Prisma.sql`er."createdAt"`, {
    fromDate,
    toDate,
  });
  const memberFilter = getOrgAnalyticsMemberFilter(organizationId);

  const memberCounts = await prisma.$queryRaw<MemberRulesCount[]>`
    SELECT er."emailAccountId", COUNT(*) as rules_count
    FROM "ExecutedRule" er
    JOIN "Member" m ON m."emailAccountId" = er."emailAccountId"
    WHERE ${memberFilter}${dateClause}
    GROUP BY er."emailAccountId"
  `;

  return bucketMemberCounts(memberCounts, (member) =>
    Number(member.rules_count),
  );
}
