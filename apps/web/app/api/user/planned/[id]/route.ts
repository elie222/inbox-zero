import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { executePlanBody } from "@/app/api/user/planned/[id]/validation";
import { executeAct } from "@/app/api/ai/act/controller";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { getActionFields } from "@/utils/actionType";

export type ExecutePlanResponse = Awaited<ReturnType<typeof executeAct>>;

export const POST = withError(async (request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });
  if (!params.id) return NextResponse.json({ error: "Missing id" });

  const json = await request.json();
  const body = executePlanBody.parse(json);

  const gmail = getGmailClient(session);

  const executedRule = await prisma.executedRule.findUnique({
    where: { id: params.id },
    include: { actionItems: true },
  });

  if (!executedRule) return NextResponse.json({ error: "Rule not found" });
  if (executedRule.userId !== session.user.id)
    return NextResponse.json({ error: "Unauthorized" });

  await executeAct({
    gmail,
    userEmail: session.user.email,
    email: body.email,
    act: {
      actions: executedRule.actionItems.map(({ type }) => ({ type })),
      args: getActionFields(executedRule.actionItems[0]) || {},
    },
    executedRuleId: params.id,
  });

  return NextResponse.json({ success: true });
});
