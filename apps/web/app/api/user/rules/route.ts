import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

async function getRules({ email }: { email: string }) {
  return await prisma.rule.findMany({
    where: { emailAccountId: email },
    include: {
      actions: true,
      group: { select: { name: true } },
      categoryFilters: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export const GET = withAuth(async (req) => {
  const email = req.auth.userEmail;
  const result = await getRules({ email });
  return NextResponse.json(result);
});
