import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise } from "@/app/api/ai/categorise/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { categoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { emailToContent } from "@/utils/mail";
import { truncate } from "@/utils/string";
import prisma from "@/utils/prisma";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { getGmailClient } from "@/utils/gmail/client";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { getAiProviderAndModel } from "@/utils/llms";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categoriseBodyWithHtml.parse(json);

  const content = emailToContent(body);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const gmail = getGmailClient(session);

  const unsubscribeLink = findUnsubscribeLink(body.textHtml);
  const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, body);

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const res = await categorise(
    {
      ...body,
      content,
      snippet: body.snippet || truncate(content, 300),
      openAIApiKey: user.openAIApiKey,
      aiProvider: provider,
      aiModel: model,
      unsubscribeLink,
      hasPreviousEmail,
    },
    { email: session.user.email },
  );

  return NextResponse.json(res);
});
