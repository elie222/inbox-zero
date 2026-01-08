import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { getConditions } from "@/utils/condition";
import { hasVariables } from "@/utils/template";
import { SafeError } from "@/utils/error";

export type RuleResponse = Awaited<ReturnType<typeof getRule>>;

async function getRule({
  ruleId,
  emailAccountId,
}: {
  ruleId: string;
  emailAccountId: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    include: {
      actions: true,
    },
  });

  if (!rule) throw new SafeError("Rule not found");

  const ruleWithActions = {
    ...rule,
    actions: rule.actions.map((action) => ({
      ...action,
      labelId: {
        value: action.labelId, // Use labelId as value, fall back to name for old rules
        name: action.label, // Fallback
        ai: hasVariables(action.label),
      },
      subject: { value: action.subject },
      content: { value: action.content },
      to: { value: action.to },
      cc: { value: action.cc },
      bcc: { value: action.bcc },
      url: { value: action.url },
      folderName: { value: action.folderName },
      folderId: { value: action.folderId },
    })),
    conditions: getConditions(rule),
  };

  return { rule: ruleWithActions };
}

export const GET = withEmailAccount(
  "user/rules/detail",
  async (request, { params }) => {
    const emailAccountId = request.auth.emailAccountId;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing rule id" });

    const result = await getRule({ ruleId: id, emailAccountId });

    return NextResponse.json(result);
  },
);
