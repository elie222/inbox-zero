import { z } from "zod";
import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { isColdEmail } from "@/app/api/ai/cold-email/controller";
import { hasPreviousEmailsFromSenderOrDomain } from "@/utils/gmail/message";
import { getGmailClient } from "@/utils/gmail/client";
import { emailToContent } from "@/utils/mail";

const coldEmailBlockerBody = z.object({
  email: z.object({
    from: z.string(),
    subject: z.string(),
    textHtml: z.string().nullable(),
    textPlain: z.string().nullable(),
    snippet: z.string().nullable(),
    date: z.string().optional(),
    threadId: z.string().nullable(),
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
      id: true,
      email: true,
      coldEmailPrompt: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });

  const hasPreviousEmail =
    body.email.date && body.email.threadId
      ? await hasPreviousEmailsFromSenderOrDomain(gmail, {
          from: body.email.from,
          date: body.email.date,
          threadId: body.email.threadId,
        })
      : false;

  const content = emailToContent({
    textHtml: body.email.textHtml || null,
    textPlain: body.email.textPlain || null,
    snippet: body.email.snippet,
  });

  const response = await isColdEmail({
    email: {
      from: body.email.from,
      subject: body.email.subject,
      content,
    },
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
