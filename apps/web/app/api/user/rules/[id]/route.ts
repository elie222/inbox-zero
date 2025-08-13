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
    where: { id: ruleId, emailAccount: { id: emailAccountId } },
    include: {
      actions: true,
      categoryFilters: true,
    },
  });

  if (!rule) throw new SafeError("Rule not found");

  const ruleWithActions = {
    ...rule,
    actions: rule.actions.map((action) => ({
      ...action,
      label: {
        value: action.label,
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
    categoryFilters: rule.categoryFilters.map((category) => category.id),
    conditions: getConditions(rule),
  };

  return { rule: ruleWithActions };
}

export const GET = withEmailAccount(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getRule({ ruleId: id, emailAccountId });

  return NextResponse.json(result);
});
