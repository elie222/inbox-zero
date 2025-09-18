import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type GetExecutedRulesCountResponse = Awaited<
  ReturnType<typeof getExecutedRulesCount>
>;

async function getExecutedRulesCount({
  organizationId,
}: {
  organizationId: string;
}) {
  const memberCounts = await prisma.executedRule.groupBy({
    by: ["emailAccountId"],
    where: {
      emailAccount: {
        members: {
          some: {
            organizationId,
          },
        },
      },
    },
    _count: {
      id: true,
    },
  });

  const result = memberCounts.map(({ emailAccountId, _count }) => ({
    emailAccountId,
    executedRulesCount: _count.id,
  }));

  return { memberCounts: result };
}

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const userMembership = await prisma.member.findFirst({
    where: { emailAccountId },
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
