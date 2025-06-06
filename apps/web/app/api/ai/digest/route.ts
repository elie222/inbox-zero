import { withError } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { digestBody } from "@/app/api/ai/digest/validation";
import { NextResponse } from "next/server";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { upsertDigest } from "@/utils/digest/index";
import prisma from "@/utils/prisma";

async function getRuleNamesByExecutedAction(
  actionId: string,
): Promise<string[]> {
  const executedAction = await prisma.executedAction.findUnique({
    where: { id: actionId },
    include: {
      executedRule: {
        include: {
          rule: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!executedAction) {
    throw new Error("Executed action not found");
  }

  return executedAction.executedRule?.rule?.name
    ? [executedAction.executedRule.rule.name]
    : [];
}

export async function handleDigestRequest(request: Request) {
  const json = await request.json();
  const body = digestBody.parse(json);
  const emailAccount = await getEmailAccountWithAi({
    emailAccountId: body.emailAccountId,
  });

  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const actionId = body.actionId;
  const ruleNames = await getRuleNamesByExecutedAction(actionId);

  const aiOutput = await aiSummarizeEmailForDigest({
    ruleNames,
    emailAccount,
    messageToSummarize: {
      id: body.message.messageId,
      from: body.message.from,
      to: body.message.to,
      subject: body.message.subject,
      content: body.message.content,
    },
  });

  if (!aiOutput) {
    return NextResponse.json(
      { error: "Failed to summarize email" },
      { status: 500 },
    );
  }

  await upsertDigest({
    messageId: body.message.messageId,
    threadId: body.message.threadId,
    emailAccountId: body.emailAccountId,
    actionId: body.actionId,
    content: aiOutput,
  });

  return NextResponse.json({ success: true });
}

export const POST = withError(handleDigestRequest);
