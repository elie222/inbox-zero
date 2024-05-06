import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

// export type GetRuleResponse = Awaited<ReturnType<typeof getRule>>;

async function getRule(options: { id: string; userId: string }) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: {
      id: options.id,
      userId: options.userId,
    },
  });
  return { rule };
}

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  if (!params.id) return NextResponse.json({ error: "Missing id" });

  const result = await getRule({ id: params.id, userId: session.user.id });

  return NextResponse.json(result);
});
