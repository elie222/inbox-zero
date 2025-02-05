import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/user/planned/get-executed-rules");

const LIMIT = 50;

export async function getExecutedRules(
  status: ExecutedRuleStatus,
  page: number,
  ruleId?: string,
) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not authenticated");

  const where = {
    userId: session.user.id,
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

  const gmail = getGmailClient(session);

  const executedRulesWithMessages = await Promise.all(
    executedRules.map(async (p) => {
      try {
        const message = await getMessage(p.messageId, gmail);
        return {
          ...p,
          message: parseMessage(message),
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
