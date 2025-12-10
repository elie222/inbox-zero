import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";
import { Prisma } from "@/generated/prisma/client";
import { orgStatsParams, type GetOrgStatsOptions } from "../types";

const EMAIL_BUCKETS = [
  { min: 500, label: "500+" },
  { min: 200, max: 499, label: "200-499" },
  { min: 100, max: 199, label: "100-199" },
  { min: 50, max: 99, label: "50-99" },
  { min: 0, max: 49, label: "<50" },
];

export type OrgEmailBucketsResponse = Awaited<
  ReturnType<typeof getEmailVolumeBuckets>
>;

export const GET = withAuth(
  "organizations/stats/email-buckets",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const { searchParams } = new URL(request.url);
    const queryParams = orgStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getEmailVolumeBuckets({
      organizationId,
      fromDate: queryParams.fromDate ?? undefined,
      toDate: queryParams.toDate ?? undefined,
    });

    return NextResponse.json(result);
  },
);

async function getEmailVolumeBuckets({
  organizationId,
  fromDate,
  toDate,
}: GetOrgStatsOptions) {
  // Get email count per member using raw SQL for efficiency
  type MemberEmailCount = { emailAccountId: string; email_count: bigint };

  // Build date conditions
  const dateConditions: Prisma.Sql[] = [];
  if (fromDate) {
    dateConditions.push(Prisma.sql`em.date >= ${new Date(fromDate)}`);
  }
  if (toDate) {
    dateConditions.push(Prisma.sql`em.date <= ${new Date(toDate)}`);
  }
  const dateClause =
    dateConditions.length > 0
      ? Prisma.sql` AND ${Prisma.join(dateConditions, " AND ")}`
      : Prisma.sql``;

  const memberCounts = await prisma.$queryRaw<MemberEmailCount[]>`
    SELECT em."emailAccountId", COUNT(*) as email_count
    FROM "EmailMessage" em
    JOIN "Member" m ON m."emailAccountId" = em."emailAccountId"
    WHERE m."organizationId" = ${organizationId} AND em.sent = false${dateClause}
    GROUP BY em."emailAccountId"
  `;

  // Bucket the results in JavaScript for flexibility
  const bucketCounts = EMAIL_BUCKETS.map((bucket) => ({
    label: bucket.label,
    userCount: 0,
  }));

  for (const member of memberCounts) {
    const count = Number(member.email_count);
    for (let i = 0; i < EMAIL_BUCKETS.length; i++) {
      const bucket = EMAIL_BUCKETS[i];
      if (
        count >= bucket.min &&
        (bucket.max === undefined || count <= bucket.max)
      ) {
        bucketCounts[i].userCount++;
        break;
      }
    }
  }

  return bucketCounts;
}
