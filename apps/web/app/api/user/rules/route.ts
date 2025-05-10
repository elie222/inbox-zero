import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

async function getRules({ emailAccountId }: { emailAccountId: string }) {
  return await prisma.rule.findMany({
    where: { emailAccountId },
    include: {
      actions: true,
      group: { select: { name: true } },
      categoryFilters: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getRules({ emailAccountId });
  return NextResponse.json(result);
});
