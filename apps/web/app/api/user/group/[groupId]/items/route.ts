import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type GroupItemsResponse = Awaited<ReturnType<typeof getGroupItems>>;

async function getGroupItems({
  userId,
  groupId,
}: {
  userId: string;
  groupId: string;
}) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, userId },
    select: {
      name: true,
      prompt: true,
      items: true,
      rule: { select: { id: true, name: true } },
    },
  });
  return { group };
}

export const GET = withError(async (_request: Request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Group id required" });

  const result = await getGroupItems({
    userId: session.user.id,
    groupId,
  });

  return NextResponse.json(result);
});
