import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getCategory } from "@/utils/redis/category";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import { Thread } from "@/components/email-list/types";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { decodeSnippet } from "@/utils/gmail/decode";
import { ExecutedRuleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // TODO not great if this is taking more than 15s

const LIMIT = 50;

export type PlannedResponse = Awaited<ReturnType<typeof getPlanned>>;

// overlapping code with apps/web/app/api/google/threads/route.ts
async function getPlanned(): Promise<{ messages: Thread[] }> {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");

  const plans = await prisma.executedRule.findMany({
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

  // should we fetch threads instead here?
  const messages = await Promise.all(
    plans.map(async (plan) => {
      if (!plan.rule) return;
      try {
        const [message, category] = await Promise.all([
          getMessage(plan.messageId, gmail),
          getCategory({
            email: session.user.email!,
            threadId: plan.threadId,
          }),
        ]);

        const threadId = message.threadId;
        if (!threadId) return;

        const thread: Thread = {
          id: threadId,
          snippet: decodeSnippet(message.snippet),
          messages: [parseMessage(message)],
          plan,
          category,
        };

        return thread;
      } catch (error) {
        console.error("getPlanned: error getting message", error);
      }
    }),
  );

  return { messages: messages.filter(isDefined) };
}

export const GET = withError(async () => {
  const messages = await getPlanned();
  return NextResponse.json(messages);
});
