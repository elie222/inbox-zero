import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise } from "@/app/api/ai/categorise/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { categoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { parseEmail, truncate } from "@/utils/mail";
import prisma from "@/utils/prisma";
import { AIModel } from "@/utils/openai";
import { findUnsubscribeLink } from "@/app/api/user/stats/tinybird/load/route";
import { findPreviousEmailsBySender } from "@/utils/gmail/message";
import { getGmailClient } from "@/utils/gmail/client";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categoriseBodyWithHtml.parse(json);

  const content =
    parseEmail(body.textHtml || "") || body.textPlain || body.snippet || "";

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const unsubscribeLink =
    (body.textHtml && findUnsubscribeLink(body.textHtml)) || "";

  const gmail = getGmailClient(session);

  // check if user has emailed us before this email
  const previousEmails = await findPreviousEmailsBySender(gmail, {
    sender: body.from,
    dateInSeconds: +new Date(body.date) / 1000, // TODO use internal date?
  });
  const hasPreviousEmail = !!previousEmails?.find(
    (p) => p.threadId !== body.threadId,
  );

  const res = await categorise(
    {
      ...body,
      content,
      snippet: body.snippet || truncate(content, 300),
      openAIApiKey: user.openAIApiKey,
      aiModel: user.aiModel as AIModel,
      unsubscribeLink,
      hasPreviousEmail,
    },
    { email: session.user.email },
  );

  return NextResponse.json(res);
});
