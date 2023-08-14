import { NextResponse } from "next/server";
import groupBy from "lodash/groupBy";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getPlans } from "@/utils/redis/plan";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload, isDefined } from "@/utils/types";

export const dynamic = "force-dynamic";

export type PlannedResponse = Awaited<ReturnType<typeof getPlanned>>;

async function getPlanned() {
  const session = await getAuthSession();
  if (!session) throw new Error("Not authenticated");

  const plans = await getPlans({ userId: session.user.id });

  const gmail = getGmailClient(session);

  const messagesByThreadId = groupBy(plans, (p) => p.threadId);

  // const threads = await Promise.all(
  //   Object.entries(messagesByThreadId).map(async ([threadId, plans]) => {
  //     if (!plans.length) return;

  //     const thread = await gmail.users.threads.get({
  //       userId: "me",
  //       id: threadId,
  //     });

  //     return {
  //       ...thread.data,
  //       plans,
  //     }

  //   })
  // );

  const messages = await Promise.all(
    plans.map(async (plan) => {
      if (!plan.rule) return;

      const res = await gmail.users.messages.get({
        userId: "me",
        id: plan.messageId,
      });

      return {
        ...res.data,
        parsedMessage: parseMessage(res.data as MessageWithPayload),
        plan,
      };
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
