import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type CleanHistoryResponse = Awaited<ReturnType<typeof getCleanHistory>>;

async function getCleanHistory({ userId }: { userId: string }) {
  const result = await prisma.cleanupJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { threads: true } } },
  });
  return { result };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.id)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getCleanHistory({ userId: session.user.id });

  return NextResponse.json(result);
});
