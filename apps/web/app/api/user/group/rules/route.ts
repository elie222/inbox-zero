import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

const groupRulesQuery = z.object({ groupId: z.string() });

export type GroupRulesResponse = Awaited<ReturnType<typeof getGroupRules>>;

async function getGroupRules({
  userId,
  groupId,
}: {
  userId: string;
  groupId: string;
}) {
  const groupWithRules = await prisma.group.findUniqueOrThrow({
    where: { id: groupId, userId },
    select: {
      rule: {
        include: {
          actions: true,
        },
      },
    },
  });
  return { rule: groupWithRules.rule };
}

export const GET = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  const query = groupRulesQuery.parse({ groupId });

  const result = await getGroupRules({
    userId: session.user.id,
    groupId: query.groupId,
  });

  return NextResponse.json(result);
});
