import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("api/user/planned/get-executed-rules");

const LIMIT = 50;

export async function getExecutedRules({
  status,
  page,
  ruleId,
  emailAccountId,
}: {
  status: ExecutedRuleStatus;
  page: number;
  ruleId?: string;
  emailAccountId: string;
}) {
  const where = {
    emailAccountId,
    status: ruleId === "skipped" ? ExecutedRuleStatus.SKIPPED : status,
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

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: "google",
  });

  const executedRulesWithMessages = await Promise.all(
    executedRules.map(async (p) => {
      try {
        return {
          ...p,
          message: emailProvider.getMessage(p.messageId),
        };
      } catch (error) {
        logger.error("Error getting message", { error });
      }
    }),
  );

  return {
    executedRules: executedRulesWithMessages.filter(isDefined),
    totalPages: Math.ceil(total / LIMIT),
  };
}
