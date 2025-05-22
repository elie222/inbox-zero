import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import type { RequestWithEmailAccount } from "@/utils/middleware";

export type GetPendingRulesResponse = Awaited<
  ReturnType<typeof getPendingRules>
>;

export const GET = withEmailAccount(async (req: RequestWithEmailAccount) => {
  const { emailAccountId } = req.auth;
  const data = await getPendingRules({ emailAccountId });
  return NextResponse.json(data);
});

async function getPendingRules({ emailAccountId }: { emailAccountId: string }) {
  const rule = await prisma.rule.findFirst({
    where: { emailAccountId, automate: false },
    select: { id: true },
  });

  return { hasPending: Boolean(rule) };
}
