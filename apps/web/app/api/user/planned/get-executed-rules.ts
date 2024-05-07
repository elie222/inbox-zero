import { ExecutedRuleStatus } from "@prisma/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import prisma from "@/utils/prisma";

const LIMIT = 50;

export async function getExecutedRules(
  status: ExecutedRuleStatus,
  page: number,
) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");

  const [pendingExecutedRules, total] = await Promise.all([
    prisma.executedRule.findMany({
      where: { userId: session.user.id, status, rule: { isNot: null } },
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        messageId: true,
        threadId: true,
        rule: true,
        actionItems: true,
        status: true,
        reason: true,
        automated: true,
        createdAt: true,
      },
    }),
    prisma.executedRule.count({
      where: { userId: session.user.id, status, rule: { isNot: null } },
    }),
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
