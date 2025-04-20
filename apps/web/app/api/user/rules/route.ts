import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
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

export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  const result = await getRules({ email });

  return NextResponse.json(result);
});
