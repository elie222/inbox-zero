import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { z } from "zod";

const ruleStatsQuery = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});

export type RuleStatsResponse = Awaited<ReturnType<typeof getRuleStats>>;

async function getRuleStats({
  emailAccountId,
  fromDate,
  toDate,
}: {
  emailAccountId: string;
  fromDate?: number;
  toDate?: number;
}) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (typeof fromDate === "number" && Number.isFinite(fromDate)) {
    dateFilter.gte = new Date(fromDate);
  }
  if (typeof toDate === "number" && Number.isFinite(toDate)) {
    dateFilter.lte = new Date(toDate);
  }

  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    },
    include: {
      rule: {
        include: {
          group: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const groupStats = executedRules.reduce(
    (acc, executedRule) => {
      const groupName = executedRule.rule?.group?.name || "No Group";

      if (!acc[groupName]) {
        acc[groupName] = {
          groupName,
          executedCount: 0,
        };
      }

      acc[groupName].executedCount += 1;
      return acc;
    },
    {} as Record<string, { groupName: string; executedCount: number }>,
  );

  const groupStatsArray = Object.values(groupStats).sort(
    (a, b) => b.executedCount - a.executedCount,
  );

  const totalExecutedRules = groupStatsArray.reduce(
    (sum, group) => sum + group.executedCount,
    0,
  );

  return {
    groupStats: groupStatsArray,
    totalExecutedRules,
  };
}

export const GET = withEmailAccount(
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const { searchParams } = new URL(request.url);
    const params = ruleStatsQuery.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getRuleStats({
      emailAccountId,
      fromDate: params.fromDate ?? undefined,
      toDate: params.toDate ?? undefined,
    });

    return NextResponse.json(result);
  },
  { allowOrgAdmins: true },
);
