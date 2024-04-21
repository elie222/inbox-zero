import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

const groupItemsQuery = z.object({ groupId: z.string() });

export type GroupItemsResponse = Awaited<ReturnType<typeof getGroupItems>>;

async function getGroupItems({
  userId,
  groupId,
}: {
  userId: string;
  groupId: string;
}) {
  const items = await prisma.groupItem.findMany({
    where: { group: { userId }, groupId },
  });
  return { items };
}

export const GET = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  const query = groupItemsQuery.parse({ groupId });

  const result = await getGroupItems({
    userId: session.user.id,
    groupId: query.groupId,
  });

  return NextResponse.json(result);
});
