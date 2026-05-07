import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import {
  ClassificationFeedbackEventType,
  GroupItemSource,
} from "@/generated/prisma/enums";

const schema = z.object({
  messageId: z.string().min(1),
  fromEmail: z.string().min(1),
  oldRuleId: z.string().min(1),
  newRuleId: z.string().min(1),
});

export const POST = withAuth("user/rule-feedback", async (request) => {
  const body = schema.parse(await request.json());
  const { messageId, fromEmail, oldRuleId, newRuleId } = body;

  const userId = request.auth.userId;
  const emailAccount = await prisma.emailAccount.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!emailAccount)
    throw new SafeError("No email account found for this user");

  const { id: emailAccountId } = emailAccount;

  const [oldRule, newRule] = await Promise.all([
    prisma.rule.findFirst({
      where: { id: oldRuleId, emailAccountId },
      select: { id: true },
    }),
    prisma.rule.findFirst({
      where: { id: newRuleId, emailAccountId },
      select: { id: true },
    }),
  ]);

  if (!oldRule || !newRule)
    return NextResponse.json(
      { error: "One or both rule IDs do not belong to your account" },
      { status: 403 },
    );

  await saveLearnedPattern({
    emailAccountId,
    from: fromEmail,
    ruleId: oldRuleId,
    exclude: true,
    logger: request.logger,
    messageId,
    source: GroupItemSource.USER,
  });

  await saveLearnedPattern({
    emailAccountId,
    from: fromEmail,
    ruleId: newRuleId,
    exclude: false,
    logger: request.logger,
    messageId,
    source: GroupItemSource.USER,
  });

  await saveClassificationFeedback({
    emailAccountId,
    sender: fromEmail,
    ruleId: oldRuleId,
    threadId: messageId,
    messageId,
    eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
    logger: request.logger,
  });

  return NextResponse.json({ ok: true });
});
