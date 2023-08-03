import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getPlans } from "@/utils/redis/plan";
import { parseMessage } from "@/utils/mail";
import { isDefined } from "@/utils/types";

export const dynamic = "force-dynamic";

export type PlannedResponse = Awaited<ReturnType<typeof getPlanned>>;

async function getPlanned() {
  const session = await getAuthSession();
  if (!session) throw new Error("Not authenticated");

  const plans = await getPlans({ userId: session.user.id });

  const gmail = getGmailClient(session);

  const messages = await Promise.all(
    plans.map(async (plan) => {
      if (!plan.rule) return;

      const res = await gmail.users.messages.get({
        userId: "me",
        id: plan.messageId,
      });

      return {
        ...res.data,
        parsedMessage: parseMessage(res.data),
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
