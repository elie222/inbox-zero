import { NextResponse } from "next/server";
import he from "he";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getPlans } from "@/utils/redis/plan";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import { Thread } from "@/components/email-list/types";
import { getCategory } from "@/utils/redis/category";
import prisma from "@/utils/prisma";

export const dynamic = "force-dynamic";

export type PlannedResponse = Awaited<ReturnType<typeof getPlanned>>;

// overlapping code with apps/web/app/api/google/threads/route.ts
async function getPlanned(): Promise<{ messages: Thread[] }> {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");

  const plans = await getPlans({ userId: session.user.id });

  const gmail = getGmailClient(session);

  const rules = await prisma.rule.findMany({
    where: { userId: session.user.id },
  });

  // should we fetch threads instead here?
  const messages = await Promise.all(
    plans.map(async (plan) => {
      if (!plan.rule) return;

      const res = await getMessage(plan.messageId, gmail);

      const rule = plan
        ? rules.find((r) => r.id === plan?.rule?.id)
        : undefined;

      const thread: Thread = {
        id: res.threadId,
        historyId: res.historyId,
        snippet: he.decode(res.snippet || ""),
        messages: [
          {
            ...res,
            parsedMessage: parseMessage(res),
          },
        ],
        plan: plan ? { ...plan, databaseRule: rule } : undefined,
        category: await getCategory({
          email: session.user.email!,
          threadId: res.threadId!,
        }),
      };

      return thread;
    })
  );

  return { messages: messages.filter(isDefined) };
}

export async function GET() {
  try {
    const messages = await getPlanned();
    return NextResponse.json(messages);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error });
  }
}
