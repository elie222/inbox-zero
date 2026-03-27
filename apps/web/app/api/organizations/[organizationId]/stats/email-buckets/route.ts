import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  bucketMemberCounts,
  buildDateClause,
  createOrgStatsRoute,
  getOrgAnalyticsMemberFilter,
} from "../utils";
import type { OrgStatsParams } from "../types";

export type OrgEmailBucketsResponse = Awaited<
  ReturnType<typeof getEmailVolumeBuckets>
>;

export const GET = createOrgStatsRoute(
  "organizations/stats/email-buckets",
  getEmailVolumeBuckets,
);

async function getEmailVolumeBuckets({
  organizationId,
  fromDate,
  toDate,
}: OrgStatsParams & { organizationId: string }) {
  type MemberEmailCount = { emailAccountId: string; email_count: bigint };

  const dateClause = buildDateClause(Prisma.sql`em.date`, { fromDate, toDate });
  const memberFilter = getOrgAnalyticsMemberFilter(organizationId);

  const memberCounts = await prisma.$queryRaw<MemberEmailCount[]>`
    SELECT em."emailAccountId", COUNT(*) as email_count
    FROM "EmailMessage" em
    JOIN "Member" m ON m."emailAccountId" = em."emailAccountId"
    WHERE ${memberFilter} AND em.sent = false${dateClause}
    GROUP BY em."emailAccountId"
  `;

  return bucketMemberCounts(memberCounts, (member) =>
    Number(member.email_count),
  );
}
