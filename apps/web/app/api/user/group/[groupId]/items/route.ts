import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type GroupItemsResponse = Awaited<ReturnType<typeof getGroupItems>>;

async function getGroupItems({
  email,
  groupId,
}: {
  email: string;
  groupId: string;
}) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, emailAccountId: email },
    select: {
      name: true,
      prompt: true,
      items: true,
      rule: { select: { id: true, name: true } },
    },
  });
  return { group };
}

export const GET = withAuth(async (request, { params }) => {
  const email = request.auth.userEmail;

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Group id required" });

  const result = await getGroupItems({ email, groupId });

  return NextResponse.json(result);
});
