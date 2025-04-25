import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type GroupRulesResponse = Awaited<ReturnType<typeof getGroupRules>>;

async function getGroupRules({
  emailAccountId,
  groupId,
}: {
  emailAccountId: string;
  groupId: string;
}) {
  const groupWithRules = await prisma.group.findUnique({
    where: { id: groupId, emailAccountId },
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

export const GET = withEmailAccount(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Group id required" });

  const result = await getGroupRules({ emailAccountId, groupId });

  return NextResponse.json(result);
});
