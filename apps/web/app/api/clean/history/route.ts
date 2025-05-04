import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type CleanHistoryResponse = Awaited<ReturnType<typeof getCleanHistory>>;

async function getCleanHistory({ emailAccountId }: { emailAccountId: string }) {
  const result = await prisma.cleanupJob.findMany({
    where: { emailAccountId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { threads: true } } },
  });
  return { result };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const result = await getCleanHistory({ emailAccountId });
  return NextResponse.json(result);
});
