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
  const membersWithCounts = await prisma.member.findMany({
    where: { organizationId },
    select: {
      userId: true,
      user: {
        select: {
          emailAccounts: {
            select: {
              id: true,
              _count: {
                select: {
                  executedRules: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const executedRulesCount = membersWithCounts.map((member) => {
    const totalCount = member.user.emailAccounts.reduce(
      (sum, account) => sum + account._count.executedRules,
      0,
    );

    return {
      userId: member.userId,
      executedRulesCount: totalCount,
    };
  });

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
