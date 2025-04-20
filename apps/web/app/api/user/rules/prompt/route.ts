import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesPromptResponse = Awaited<ReturnType<typeof getRulesPrompt>>;

async function getRulesPrompt(options: { email: string }) {
  return await prisma.emailAccount.findUnique({
    where: { email: options.email },
    select: { rulesPrompt: true },
  });
}

export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  const result = await getRulesPrompt({ email });

  return NextResponse.json(result);
});
