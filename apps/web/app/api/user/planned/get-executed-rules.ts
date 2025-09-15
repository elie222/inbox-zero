import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("api/user/planned/get-executed-rules");

const LIMIT = 50;

export async function getExecutedRules({
  status,
  page,
  ruleId,
  emailAccountId,
  emailProvider,
}: {
  status: ExecutedRuleStatus;
  page: number;
  ruleId?: string;
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  const where = {
    emailAccountId,
    status: ruleId === "skipped" ? ExecutedRuleStatus.SKIPPED : status,
    rule: ruleId === "skipped" ? undefined : { isNot: null },
    ruleId: ruleId === "all" || ruleId === "skipped" ? undefined : ruleId,
  };
  logger.info("getExecutedRules query", { where });

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
            categoryFilters: true,
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
          emailAccountId,
          ruleId,
        });
      }
    }),
  );

  return {
    executedRules: executedRulesWithMessages.filter(isDefined),
    totalPages: Math.ceil(total / LIMIT),
  };
}
