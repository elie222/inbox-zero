import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus, type Prisma } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";

const LIMIT = 50;

export const dynamic = "force-dynamic";

export type GetExecutedRulesResponse = Awaited<
  ReturnType<typeof getExecutedRules>
>;

export const GET = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get("page") || "1");
  const ruleId = url.searchParams.get("ruleId") || "all";

  const result = await getExecutedRules({
    page,
    ruleId,
    emailAccountId,
    emailProvider: request.emailProvider,
  });

  return NextResponse.json(result);
});

async function getExecutedRules({
  page,
  ruleId,
  emailAccountId,
  emailProvider,
}: {
  page: number;
  ruleId?: string;
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  const logger = createScopedLogger("api/user/executed-rules/history").with({
    emailAccountId,
    ruleId,
  });

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
        rule: {
          include: {
            group: { select: { name: true } },
          },
        },
        actionItems: true,
        status: true,
        reason: true,
        automated: true,
        createdAt: true,
      },
    }),
    prisma.executedRule.count({ where }),
  ]);

  const executedRulesWithMessages = await Promise.all(
    executedRules.map(async (p) => {
      try {
        return {
          ...p,
          message: await emailProvider.getMessage(p.messageId),
        };
      } catch (error) {
        logger.error("Error getting message", {
          error,
          messageId: p.messageId,
          threadId: p.threadId,
        });
      }
    }),
  );

  return {
    executedRules: executedRulesWithMessages.filter(isDefined),
    totalPages: Math.ceil(total / LIMIT),
  };
}
