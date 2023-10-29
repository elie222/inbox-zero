import { NextResponse } from "next/server";
// import groupBy from "lodash/groupBy";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getPlans } from "@/utils/redis/plan";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";

export const dynamic = "force-dynamic";

export type PlannedResponse = Awaited<ReturnType<typeof getPlanned>>;

async function getPlanned() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const plans = await getPlans({ userId: session.user.id });

  const gmail = getGmailClient(session);

  // const messagesByThreadId = groupBy(plans, (p) => p.threadId);

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

      const res = await getMessage(plan.messageId, gmail);

      return {
        ...res,
        parsedMessage: parseMessage(res),
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
