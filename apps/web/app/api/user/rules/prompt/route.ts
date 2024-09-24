import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesPromptResponse = Awaited<ReturnType<typeof getRulesPrompt>>;

async function getRulesPrompt(options: { userId: string }) {
  return await prisma.user.findUnique({
    where: { id: options.userId },
    select: { rulesPrompt: true },
  });
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getRulesPrompt({ userId: session.user.id });

  return NextResponse.json(result);
});
