import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import prisma from "@/utils/prisma";

export const dynamic = "force-dynamic";

export type PlanHistoryResponse = Awaited<ReturnType<typeof getPlanHistory>>;

async function getPlanHistory() {
  const session = await getAuthSession();
  if (!session) throw new Error("Not authenticated");

  const history = await prisma.executedRule.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { rule: true },
  });

  return { history };
}

export async function GET() {
  try {
    const messages = await getPlanHistory();
    return NextResponse.json(messages);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error });
  }
}
