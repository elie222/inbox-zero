import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { sortRulesByCanonicalOrder } from "@/utils/rule/sort";

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

async function getRules({ emailAccountId }: { emailAccountId: string }) {
  const rules = await prisma.rule.findMany({
    where: { emailAccountId },
    include: {
      actions: {
        include: {
          messagingChannel: {
            select: { provider: true },
          },
        },
      },
      group: { select: { name: true } },
      organizationRule: {
        select: {
          enabled: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return sortRulesByCanonicalOrder(rules);
}

export const GET = withEmailAccount(
  "user/rules",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    try {
      const result = await getRules({ emailAccountId });
      return NextResponse.json(result);
    } catch (error) {
      request.logger.error("Error fetching rules", {
        error,
      });
      return NextResponse.json(
        { error: "Failed to fetch rules" },
        { status: 500 },
      );
    }
  },
  { requestTiming: {} },
);
