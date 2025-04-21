import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type RuleResponse = Awaited<ReturnType<typeof getRule>>;

async function getRule({ ruleId, email }: { ruleId: string; email: string }) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId: email },
  });
  return { rule };
}

export const GET = withAuth(async (request, { params }) => {
  const email = request.auth.userEmail;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getRule({ ruleId: id, email });

  return NextResponse.json(result);
});
