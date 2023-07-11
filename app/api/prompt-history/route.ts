import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import prisma from "@/utils/prisma";

export type PromptHistoryResponse = Awaited<
  ReturnType<typeof getPromptHistory>
>;

async function getPromptHistory(options: { userId: string }) {
  const history = await prisma.promptHistory.findMany({
    where: {
      userId: options.userId,
    },
  });
  return { history };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const history = await getPromptHistory({ userId: session.user.id });

  return NextResponse.json(history);
}
