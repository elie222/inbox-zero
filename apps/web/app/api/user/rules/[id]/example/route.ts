import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailProvider } from "@/utils/middleware";
import { fetchExampleMessages } from "@/app/api/user/rules/[id]/example/controller";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

async function getExamples({
  ruleId,
  emailAccountId,
  provider,
}: {
  ruleId: string;
  emailAccountId: string;
  provider: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    include: { group: { include: { items: true } } },
  });

  if (!rule) throw new SafeError("Rule not found");

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  const exampleMessages = await fetchExampleMessages(rule, emailProvider);

  return exampleMessages;
}

export const GET = withEmailProvider(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;
  const provider = request.emailProvider.name;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getExamples({ ruleId: id, emailAccountId, provider });

  return NextResponse.json(result);
});
