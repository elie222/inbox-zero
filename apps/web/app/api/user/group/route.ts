import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GroupsResponse = Awaited<ReturnType<typeof getGroups>>;

async function getGroups({ emailAccountId }: { emailAccountId: string }) {
  const groups = await prisma.group.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      rule: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });
  return { groups };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getGroups({ emailAccountId });
  return NextResponse.json(result);
});
