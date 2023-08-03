import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { actBody } from "@/app/api/ai/act/validation";
import { withError } from "@/utils/middleware";

export const POST = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = actBody.parse(json);

  const gmail = getGmailClient(session);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: { rules: { include: { actions: true } } },
  });

  const result = await planOrExecuteAct({
    email: body.email,
    rules: user.rules,
    gmail,
    allowExecute: !!body.allowExecute,
    forceExecute: body.forceExecute,
    userId: user.id,
    automated: false,
    userAbout: user.about || "",
  });

  return NextResponse.json(result || { rule: null });
});
