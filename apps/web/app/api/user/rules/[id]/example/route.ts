import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { getGmailClient } from "@/utils/gmail/client";
import { fetchExampleMessages } from "@/app/api/user/rules/[id]/example/controller";
import { SafeError } from "@/utils/error";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

async function getExamples(options: { ruleId: string }) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not logged in");

  const rule = await prisma.rule.findUnique({
    where: { id: options.ruleId, userId: session.user.id },
    include: { group: { include: { items: true } } },
  });

  if (!rule) throw new SafeError("Rule not found");

  const gmail = getGmailClient(session);

  const exampleMessages = await fetchExampleMessages(rule, gmail);

  return exampleMessages;
}

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rule id" });

  const result = await getExamples({ ruleId: id });

  return NextResponse.json(result);
});
