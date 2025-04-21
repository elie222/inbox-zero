import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesPromptResponse = Awaited<ReturnType<typeof getRulesPrompt>>;

async function getRulesPrompt(options: { email: string }) {
  return await prisma.emailAccount.findUnique({
    where: { email: options.email },
    select: { rulesPrompt: true },
  });
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const result = await getRulesPrompt({ email });

  return NextResponse.json(result);
});
