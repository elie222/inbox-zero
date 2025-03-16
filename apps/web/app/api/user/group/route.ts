import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type GroupsResponse = Awaited<ReturnType<typeof getGroups>>;

async function getGroups({ userId }: { userId: string }) {
  const groups = await prisma.group.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      rule: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });
  return { groups };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getGroups({ userId: session.user.id });

  return NextResponse.json(result);
});
