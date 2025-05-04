import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

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
  });
  return { rule };
}

export const GET = withEmailAccount(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getRule({ ruleId: id, emailAccountId });

  return NextResponse.json(result);
});
