import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise } from "@/app/api/ai/categorise/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { categoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { parseEmail, truncate } from "@/utils/mail";
import prisma from "@/utils/prisma";
import { AIModel } from "@/utils/openai";
import { findUnsubscribeLink } from "@/utils/unsubscribe";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
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

  const gmail = getGmailClient(session);

  const unsubscribeLink = findUnsubscribeLink(body.textHtml);
  const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, body);

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
