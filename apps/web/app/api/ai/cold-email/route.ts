import { z } from "zod";
import { NextResponse } from "next/server";
import { type gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { isColdEmail } from "@/app/api/ai/cold-email/controller";
import { UserAIFields } from "@/utils/openai";
import { findUnsubscribeLink } from "@/utils/unsubscribe";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { getGmailClient } from "@/utils/gmail/client";

const coldEmailBlockerBody = z.object({
  email: z.object({
    from: z.string(),
    subject: z.string(),
    body: z.string(),
    textHtml: z.string().optional(),
    date: z.string().optional(),
    threadId: z.string().optional(),
  }),
});
export type ColdEmailBlockerBody = z.infer<typeof coldEmailBlockerBody>;
export type ColdEmailBlockerResponse = Awaited<
  ReturnType<typeof checkColdEmail>
>;

async function checkColdEmail(
  body: ColdEmailBlockerBody,
  options: { email: string },
  gmail: gmail_v1.Gmail,
) {
  const { email } = options;

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: {
      coldEmailPrompt: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const unsubscribeLink = findUnsubscribeLink(
    body.email.textHtml || body.email.body,
  );
  // || getHeaderUnsubscribe(parsedMessage.headers);

  const hasPreviousEmail =
    body.email.date && body.email.threadId
      ? await hasPreviousEmailsFromSender(gmail, {
          from: body.email.from,
          date: body.email.date,
          threadId: body.email.threadId,
        })
      : false;

  const yes = await isColdEmail({
    email: body.email,
    userOptions: {
      aiModel: user.aiModel as UserAIFields["aiModel"],
      openAIApiKey: user.openAIApiKey,
      coldEmailPrompt: user.coldEmailPrompt,
    },
    hasPreviousEmail,
    unsubscribeLink,
  });

  return { isColdEmail: yes };
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = coldEmailBlockerBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await checkColdEmail(
    body,
    { email: session.user.email },
    gmail,
  );

  return NextResponse.json(result);
});
