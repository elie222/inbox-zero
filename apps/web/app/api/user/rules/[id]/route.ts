import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type RuleResponse = Awaited<ReturnType<typeof getRule>>;

async function getRule({ ruleId, email }: { ruleId: string; email: string }) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId: email },
  });
  return { rule };
}

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getRule({
    ruleId: id,
    email: session.user.email,
  });

  return NextResponse.json(result);
});
