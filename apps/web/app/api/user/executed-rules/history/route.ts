import { NextResponse } from "next/server";
import groupBy from "lodash/groupBy";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const LIMIT = 50;

export const dynamic = "force-dynamic";

export type GetExecutedRulesResponse = Awaited<
  ReturnType<typeof getExecutedRules>
>;

export const GET = withEmailAccount(
  "user/executed-rules/history",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const url = new URL(request.url);
    const page = Number.parseInt(url.searchParams.get("page") || "1");
    const ruleId = url.searchParams.get("ruleId") || "all";

    const result = await getExecutedRules({
      page,
      ruleId,
      emailAccountId,
    });

    return NextResponse.json(result);
  },
);

async function getExecutedRules({
  page,
  ruleId,
  emailAccountId,
}: {
  page: number;
  ruleId?: string;
  emailAccountId: string;
}) {
  const where: Prisma.ExecutedRuleWhereInput = {
    emailAccountId,
    status:
      ruleId === "skipped"
        ? ExecutedRuleStatus.SKIPPED
        : ExecutedRuleStatus.APPLIED,
    rule: ruleId === "skipped" ? undefined : { isNot: null },
    ruleId: ruleId === "all" || ruleId === "skipped" ? undefined : ruleId,
  };

  const [executedRules, total] = await Promise.all([
    prisma.executedRule.findMany({
      where,
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        messageId: true,
        threadId: true,
        actionItems: true,
        status: true,
        reason: true,
        automated: true,
        createdAt: true,
        rule: {
          select: {
            id: true,
            name: true,
            systemType: true,
            instructions: true,
            groupId: true,
            from: true,
            to: true,
            subject: true,
            body: true,
            conditionalOperator: true,
            group: { select: { name: true } },
          },
        },
      },
    }),
    prisma.executedRule.count({ where }),
  ]);

  const executedRulesByMessageId = groupBy(executedRules, (er) => er.messageId);

  const results = Object.entries(executedRulesByMessageId).flatMap(
    ([messageId, groupedExecutedRules]) => {
      const firstExecutedRule = groupedExecutedRules[0];
      if (!firstExecutedRule) return [];

      return [
        {
          messageId,
          threadId: firstExecutedRule.threadId,
          executedRules: groupedExecutedRules,
        },
      ];
    },
  );

  return {
    results,
    totalPages: Math.ceil(total / LIMIT),
  };
}
