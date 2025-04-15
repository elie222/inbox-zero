import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type DraftLogsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const response = await getData(userId);

  return NextResponse.json(response);
});

async function getData(userId: string) {
  const draftLogs = await prisma.draftSendLog.findMany({
    where: { executedAction: { executedRule: { userId } } },
    select: {
      id: true,
      createdAt: true,
      similarityScore: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return { draftLogs };
}
