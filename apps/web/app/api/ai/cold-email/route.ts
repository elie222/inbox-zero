import { z } from "zod";
import { NextResponse } from "next/server";
import { type gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { isColdEmail } from "@/app/api/ai/cold-email/controller";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
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
  gmail: gmail_v1.Gmail,
  userEmail: string,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: userEmail },
    select: {
      email: true,
      coldEmailPrompt: true,
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const hasPreviousEmail =
    body.email.date && body.email.threadId
      ? await hasPreviousEmailsFromSender(gmail, {
          from: body.email.from,
          date: body.email.date,
          threadId: body.email.threadId,
        })
      : false;

  const response = await isColdEmail({
    email: body.email,
    user,
    hasPreviousEmail,
  });

  return response;
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = coldEmailBlockerBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await checkColdEmail(body, gmail, session.user.email);

  return NextResponse.json(result);
});
