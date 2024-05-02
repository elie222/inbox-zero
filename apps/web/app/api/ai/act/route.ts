import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { actBodyWithHtml } from "@/app/api/ai/act/validation";
import { withError } from "@/utils/middleware";

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
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
      rules: { include: { actions: true } },
    },
  });

  const result = await planOrExecuteAct({
    email: body.email,
    rules: user.rules,
    gmail,
    allowExecute: !!body.allowExecute,
    forceExecute: body.forceExecute,
    user,
    automated: false,
  });

  return NextResponse.json(result || { rule: null });
});
