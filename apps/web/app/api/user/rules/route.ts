import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

async function getRules({ userId }: { userId: string }) {
  return await prisma.rule.findMany({
    where: { userId },
    include: {
      actions: true,
      group: { select: { name: true } },
      categoryFilters: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getRules({ userId: session.user.id });

  return NextResponse.json(result);
});
