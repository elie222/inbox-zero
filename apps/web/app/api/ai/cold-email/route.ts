import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { isColdEmail } from "@/app/api/ai/cold-email/controller";
import { UserAIFields } from "@/utils/openai";
import { findUnsubscribeLink } from "@/utils/unsubscribe";

const coldEmailBlockerBody = z.object({
  email: z.object({
    from: z.string(),
    subject: z.string(),
    body: z.string(),
    textHtml: z.string().optional(),
  }),
});
export type ColdEmailBlockerBody = z.infer<typeof coldEmailBlockerBody>;
export type ColdEmailBlockerResponse = Awaited<
  ReturnType<typeof checkColdEmail>
>;

async function checkColdEmail(
  body: ColdEmailBlockerBody,
  options: { email: string },
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

  // const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, {
  //   from: body.email.from,
  //   date: parsedMessage.headers.date,
  //   threadId: m.message.threadId,
  // });

  const yes = await isColdEmail({
    email: body.email,
    userOptions: {
      aiModel: user.aiModel as UserAIFields["aiModel"],
      openAIApiKey: user.openAIApiKey,
      coldEmailPrompt: user.coldEmailPrompt,
    },
    hasPreviousEmail: false, // assumes false in tests
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

  const result = await checkColdEmail(body, { email: session.user.email });

  return NextResponse.json(result);
});
