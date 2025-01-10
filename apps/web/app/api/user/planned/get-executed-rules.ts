import type { ExecutedRuleStatus } from "@prisma/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

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
    status,
    rule: { isNot: null },
    ruleId: ruleId === "all" ? undefined : ruleId,
  };

  const [pendingExecutedRules, total] = await Promise.all([
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

  const executedRules = await Promise.all(
    pendingExecutedRules.map(async (p) => {
      try {
        const message = await getMessage(p.messageId, gmail);
        return {
          ...p,
          message: parseMessage(message),
        };
      } catch (error) {
        console.error("getExecutedRules: error getting message", error);
      }
    }),
  );

  return {
    executedRules: executedRules.filter(isDefined),
    totalPages: Math.ceil(total / LIMIT),
  };
}
