import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { actBodyWithHtml } from "@/app/api/ai/act/validation";
import { withError } from "@/utils/middleware";
import { parseEmail } from "@/utils/mail";
import { AIModel } from "@/utils/openai";

export const maxDuration = 60;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const json = await request.json();
  const body = actBodyWithHtml.parse(json);

  const gmail = getGmailClient(session);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: { rules: { include: { actions: true } } },
  });

  const content =
    parseEmail(body.email.textHtml || "") ||
    body.email.textPlain ||
    body.email.snippet ||
    "";

  const result = await planOrExecuteAct({
    email: { ...body.email, content },
    rules: user.rules,
    gmail,
    allowExecute: !!body.allowExecute,
    forceExecute: body.forceExecute,
    userId: user.id,
    userEmail: user.email || "",
    automated: false,
    userAbout: user.about || "",
    aiModel: user.aiModel as AIModel,
    openAIApiKey: user.openAIApiKey,
  });

  return NextResponse.json(result || { rule: null });
});
