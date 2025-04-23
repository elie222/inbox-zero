import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchExampleMessages } from "@/app/api/user/rules/[id]/example/controller";
import { SafeError } from "@/utils/error";
import { getGmailClientForEmail } from "@/utils/account";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

async function getExamples({
  ruleId,
  email,
}: {
  ruleId: string;
  email: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId: email },
    include: { group: { include: { items: true } } },
  });

  if (!rule) throw new SafeError("Rule not found");

  const gmail = await getGmailClientForEmail({ email });

  const exampleMessages = await fetchExampleMessages(rule, gmail);

  return exampleMessages;
}

export const GET = withAuth(async (request, { params }) => {
  const email = request.auth.userEmail;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getExamples({ ruleId: id, email });

  return NextResponse.json(result);
});
