import { NextResponse } from "next/server";
import { z } from "zod";
import sumBy from "lodash/sumBy";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { Prisma } from "@/generated/prisma/client";

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
  // Build WHERE conditions as SQL fragments
  const conditions: Prisma.Sql[] = [
    Prisma.sql`er."emailAccountId" = ${emailAccountId}`,
  ];

  if (typeof fromDate === "number" && Number.isFinite(fromDate)) {
    conditions.push(Prisma.sql`er."createdAt" >= ${new Date(fromDate)}`);
  }
  if (typeof toDate === "number" && Number.isFinite(toDate)) {
    conditions.push(Prisma.sql`er."createdAt" <= ${new Date(toDate)}`);
  }

  const whereClause = Prisma.join(conditions, " AND ");

  const results = await prisma.$queryRaw<
    Array<{ rule_name: string; executed_count: bigint }>
  >(Prisma.sql`
    SELECT 
      COALESCE(r.name, 'No Rule') AS rule_name,
      COUNT(er.id) AS executed_count
    FROM "ExecutedRule" er
    LEFT JOIN "Rule" r ON er."ruleId" = r.id
    WHERE ${whereClause}
    GROUP BY r.name
    ORDER BY executed_count DESC
  `);

  const ruleStats = results.map((row) => ({
    ruleName: row.rule_name,
    executedCount: Number(row.executed_count),
  }));

  const totalExecutedRules = sumBy(ruleStats, (rs) => rs.executedCount);

  return {
    ruleStats,
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
