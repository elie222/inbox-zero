import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { ExecutedRuleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // TODO not great if this is taking more than 15s

const LIMIT = 50;

export type PendingExecutedRules = Awaited<
  ReturnType<typeof getPendingExecutedRules>
>;

// overlapping code with apps/web/app/api/google/threads/route.ts
async function getPendingExecutedRules() {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");

  const pendingExecutedRules = await prisma.executedRule.findMany({
    where: { userId: session.user.id, status: ExecutedRuleStatus.PENDING },
    take: LIMIT,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      rule: true,
      actionItems: true,
      status: true,
      reason: true,
    },
  });

  const gmail = getGmailClient(session);

  const pendingRulesWithMessage = await Promise.all(
    pendingExecutedRules.map(async (p) => {
      if (!p.rule) return;
      try {
        const message = await getMessage(p.messageId, gmail);

        const threadId = message.threadId;
        if (!threadId) return;

        return {
          ...p,
          message: parseMessage(message),
        };
      } catch (error) {
        console.error("getPendingExecutedRules: error getting message", error);
      }
    }),
  );

  return pendingRulesWithMessage.filter(isDefined);
}

export const GET = withError(async () => {
  const messages = await getPendingExecutedRules();
  return NextResponse.json(messages);
});
