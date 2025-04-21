import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type CleanHistoryResponse = Awaited<ReturnType<typeof getCleanHistory>>;

async function getCleanHistory({ email }: { email: string }) {
  const result = await prisma.cleanupJob.findMany({
    where: { email },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { threads: true } } },
  });
  return { result };
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;
  const result = await getCleanHistory({ email });
  return NextResponse.json(result);
});
