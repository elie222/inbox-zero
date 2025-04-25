import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GroupItemsResponse = Awaited<ReturnType<typeof getGroupItems>>;

async function getGroupItems({
  emailAccountId,
  groupId,
}: {
  emailAccountId: string;
  groupId: string;
}) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, emailAccountId },
    select: {
      name: true,
      prompt: true,
      items: true,
      rule: { select: { id: true, name: true } },
    },
  });
  return { group };
}

export const GET = withEmailAccount(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Group id required" });

  const result = await getGroupItems({ emailAccountId, groupId });

  return NextResponse.json(result);
});
