import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type CleanHistoryResponse = Awaited<ReturnType<typeof getCleanHistory>>;

async function getCleanHistory({ email }: { email: string }) {
  const result = await prisma.cleanupJob.findMany({
    where: { email },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { threads: true } } },
  });
  return { result };
}

export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  const result = await getCleanHistory({ email });

  return NextResponse.json(result);
});
