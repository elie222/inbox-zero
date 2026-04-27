import { NextResponse } from "next/server";
import groupBy from "lodash/groupBy";
import { serializedMatchMetadataSchema } from "@/app/api/chat/validation";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const LIMIT = 50;

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

  const [threadGroups, totalThreadGroups] = await Promise.all([
    prisma.executedRule.groupBy({
      by: ["threadId"],
      where,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: LIMIT,
      skip: (page - 1) * LIMIT,
    }),
    prisma.executedRule.groupBy({ by: ["threadId"], where }),
  ]);

  const threadIds = threadGroups.map((group) => group.threadId);

  const executedRules = threadIds.length
    ? await prisma.executedRule.findMany({
        where: { ...where, threadId: { in: threadIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          messageId: true,
          threadId: true,
          actionItems: true,
          status: true,
          reason: true,
          matchMetadata: true,
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
      })
    : [];

  const executedRulesByThreadId = groupBy(executedRules, (er) => er.threadId);

  const results = threadIds
    .map((threadId) => {
      const threadExecutedRules = executedRulesByThreadId[threadId] ?? [];
      const executedRulesByMessageId = groupBy(
        threadExecutedRules,
        (er) => er.messageId,
      );

      return {
        threadId,
        messages: Object.entries(executedRulesByMessageId)
          .filter(([, groupedExecutedRules]) => groupedExecutedRules.length > 0)
          .map(([messageId, groupedExecutedRules]) => ({
            messageId,
            threadId,
            executedRules: groupedExecutedRules.map((executedRule) => ({
              ...executedRule,
              matchMetadata:
                serializedMatchMetadataSchema.safeParse(
                  executedRule.matchMetadata,
                ).data ?? null,
            })),
          })),
      };
    })
    .filter((thread) => thread.messages.length > 0);

  return {
    results,
    totalPages: Math.ceil(totalThreadGroups.length / LIMIT),
  };
}
