import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";
import { Prisma } from "@/generated/prisma/client";

const orgStatsParams = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type OrgStatsParams = z.infer<typeof orgStatsParams>;

export type OrgStatsResponse = Awaited<ReturnType<typeof getOrgStats>>;

// Bucket boundaries for email volume per user
const EMAIL_BUCKETS = [
  { min: 500, label: "500+" },
  { min: 200, max: 500, label: "200-500" },
  { min: 100, max: 200, label: "100-200" },
  { min: 50, max: 100, label: "50-100" },
  { min: 0, max: 50, label: "<50" },
];

// Bucket boundaries for executed rules per user
const RULES_BUCKETS = [
  { min: 500, label: "500+" },
  { min: 200, max: 500, label: "200-500" },
  { min: 100, max: 200, label: "100-200" },
  { min: 50, max: 100, label: "50-100" },
  { min: 0, max: 50, label: "<50" },
];

export const GET = withAuth(
  "organizations/stats",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const { searchParams } = new URL(request.url);
    const queryParams = orgStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getOrgStats({
      organizationId,
      fromDate: queryParams.fromDate ?? undefined,
      toDate: queryParams.toDate ?? undefined,
    });

    return NextResponse.json(result);
  },
);

interface GetOrgStatsOptions {
  organizationId: string;
  fromDate?: number;
  toDate?: number;
}

async function getOrgStats(options: GetOrgStatsOptions) {
  const [emailBuckets, rulesBuckets, totals] = await Promise.all([
    getEmailVolumeBuckets(options),
    getExecutedRulesBuckets(options),
    getTotals(options),
  ]);

  return {
    emailBuckets,
    rulesBuckets,
    totals,
  };
}

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
        (bucket.max === undefined || count < bucket.max)
      ) {
        bucketCounts[i].userCount++;
        break;
      }
    }
  }

  return bucketCounts;
}

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
