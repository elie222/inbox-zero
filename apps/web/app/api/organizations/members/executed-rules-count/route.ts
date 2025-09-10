import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type GetExecutedRulesCountResponse = Awaited<
  ReturnType<typeof getExecutedRulesCount>
>;

async function getExecutedRulesCount({
  organizationId,
}: {
  organizationId: string;
}) {
  const result = await prisma.$queryRaw<
    Array<{
      user_id: string;
      executed_rules_count: bigint;
    }>
  >`
    SELECT 
      m."userId" as user_id,
      COUNT(er.id) as executed_rules_count
    FROM "Member" m
    JOIN "User" u ON m."userId" = u.id
    JOIN "EmailAccount" ea ON u.id = ea."userId" AND ea.email = u.email
    LEFT JOIN "ExecutedRule" er ON ea.id = er."emailAccountId"
    WHERE m."organizationId" = ${organizationId}
    GROUP BY m."userId"
  `;

  // Transform the result to match expected format
  const executedRulesCount = result.map((row) => ({
    userId: row.user_id,
    executedRulesCount: Number(row.executed_rules_count),
  }));

  return { executedRulesCount };
}

export const GET = withAuth(async (request) => {
  const { userId } = request.auth;

  const userMembership = await prisma.member.findFirst({
    where: { userId },
    select: { organizationId: true },
  });

  if (!userMembership) {
    throw new SafeError("You are not a member of any organization.");
  }

  const result = await getExecutedRulesCount({
    organizationId: userMembership.organizationId,
  });

  return NextResponse.json(result);
});
