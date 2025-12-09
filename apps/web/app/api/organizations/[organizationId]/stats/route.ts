import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";

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

    const result = await getOrgStats({ organizationId });

    return NextResponse.json(result);
  },
);

async function getOrgStats({ organizationId }: { organizationId: string }) {
  const [emailBuckets, rulesBuckets, totals] = await Promise.all([
    getEmailVolumeBuckets(organizationId),
    getExecutedRulesBuckets(organizationId),
    getTotals(organizationId),
  ]);

  return {
    emailBuckets,
    rulesBuckets,
    totals,
  };
}

async function getEmailVolumeBuckets(organizationId: string) {
  // Get email count per member using raw SQL for efficiency
  type MemberEmailCount = { emailAccountId: string; email_count: bigint };

  const memberCounts = await prisma.$queryRaw<MemberEmailCount[]>`
    SELECT em."emailAccountId", COUNT(*) as email_count
    FROM "EmailMessage" em
    JOIN "Member" m ON m."emailAccountId" = em."emailAccountId"
    WHERE m."organizationId" = ${organizationId} AND em.sent = false
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

async function getExecutedRulesBuckets(organizationId: string) {
  // Get executed rules count per member
  type MemberRulesCount = { emailAccountId: string; rules_count: bigint };

  const memberCounts = await prisma.$queryRaw<MemberRulesCount[]>`
    SELECT er."emailAccountId", COUNT(*) as rules_count
    FROM "ExecutedRule" er
    JOIN "Member" m ON m."emailAccountId" = er."emailAccountId"
    WHERE m."organizationId" = ${organizationId}
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

async function getTotals(organizationId: string) {
  type TotalsResult = {
    total_emails: bigint;
    total_rules: bigint;
    active_members: bigint;
  };

  const result = await prisma.$queryRaw<TotalsResult[]>`
    SELECT
      (
        SELECT COUNT(*)
        FROM "EmailMessage" em
        JOIN "Member" m ON m."emailAccountId" = em."emailAccountId"
        WHERE m."organizationId" = ${organizationId} AND em.sent = false
      ) as total_emails,
      (
        SELECT COUNT(*)
        FROM "ExecutedRule" er
        JOIN "Member" m ON m."emailAccountId" = er."emailAccountId"
        WHERE m."organizationId" = ${organizationId}
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
