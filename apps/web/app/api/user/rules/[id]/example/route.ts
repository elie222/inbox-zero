import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailProvider } from "@/utils/middleware";
import { fetchExampleMessages } from "@/app/api/user/rules/[id]/example/controller";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

async function getExamples({
  ruleId,
  emailAccountId,
  provider,
  logger,
}: {
  ruleId: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    include: { group: { include: { items: true } } },
  });

  if (!rule) throw new SafeError("Rule not found");

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const exampleMessages = await fetchExampleMessages(rule, emailProvider);

  return exampleMessages;
}

export const GET = withEmailProvider(
  "user/rules/example",
  async (request, { params }) => {
    const emailAccountId = request.auth.emailAccountId;
    const provider = request.emailProvider.name;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing rule id" });

    const result = await getExamples({
      ruleId: id,
      emailAccountId,
      provider,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
