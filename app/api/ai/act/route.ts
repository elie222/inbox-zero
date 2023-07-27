import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import {
  planAct,
  actBody,
  planAndExecuteAct,
} from "@/app/api/ai/act/controller";
import { getGmailClient } from "@/utils/google";
import prisma from "@/utils/prisma";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = actBody.parse(json);

  const gmail = getGmailClient(session);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: { rules: true },
  });

  if (body.allowExecute) {
    const result = await planAndExecuteAct({
      body,
      rules: user.rules,
      gmail,
      forceExecute: body.forceExecute,
      userId: user.id,
      messageId: body.messageId || "",
      threadId: body.threadId || "",
      automated: false,
    });

    return NextResponse.json(result || { action: "no_action" });
  }

  const result = await planAct({ body, rules: user.rules });

  return NextResponse.json(result || { action: "no_action" });
}
