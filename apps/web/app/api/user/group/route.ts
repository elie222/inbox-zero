import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export type GroupsResponse = Awaited<ReturnType<typeof getGroups>>;

async function getGroups({ email }: { email: string }) {
  const groups = await prisma.group.findMany({
    where: { emailAccountId: email },
    select: {
      id: true,
      name: true,
      rule: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });
  return { groups };
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const result = await getGroups({ email });

  return NextResponse.json(result);
});
