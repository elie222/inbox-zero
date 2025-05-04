import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { fetchExampleMessages } from "@/app/api/user/rules/[id]/example/controller";
import { SafeError } from "@/utils/error";
import { getGmailClientForEmail } from "@/utils/account";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

async function getExamples({
  ruleId,
  emailAccountId,
}: {
  ruleId: string;
  emailAccountId: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    include: { group: { include: { items: true } } },
  });

  if (!rule) throw new SafeError("Rule not found");

  const gmail = await getGmailClientForEmail({ emailAccountId });

  const exampleMessages = await fetchExampleMessages(rule, gmail);

  return exampleMessages;
}

export const GET = withEmailAccount(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getExamples({ ruleId: id, emailAccountId });

  return NextResponse.json(result);
});
