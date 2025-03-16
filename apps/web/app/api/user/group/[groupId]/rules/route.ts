import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type GroupRulesResponse = Awaited<ReturnType<typeof getGroupRules>>;

async function getGroupRules({
  userId,
  groupId,
}: {
  userId: string;
  groupId: string;
}) {
  const groupWithRules = await prisma.group.findUnique({
    where: { id: groupId, userId },
    select: {
      rule: {
        include: {
          actions: true,
        },
      },
    },
  });

  if (!groupWithRules) throw new SafeError("Group not found");

  return { rule: groupWithRules.rule };
}

export const GET = withError(async (_request: Request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Group id required" });

  const result = await getGroupRules({
    userId: session.user.id,
    groupId,
  });

  return NextResponse.json(result);
});
