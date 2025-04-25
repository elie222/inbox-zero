import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesPromptResponse = Awaited<ReturnType<typeof getRulesPrompt>>;

async function getRulesPrompt({ emailAccountId }: { emailAccountId: string }) {
  return await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { rulesPrompt: true },
  });
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const result = await getRulesPrompt({ emailAccountId });

  return NextResponse.json(result);
});
