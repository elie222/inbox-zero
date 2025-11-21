import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import type { PersonaAnalysis } from "@/utils/ai/knowledge/persona";

export type GetPersonaResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/persona", async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { personaAnalysis: true, role: true },
  });

  return {
    personaAnalysis: emailAccount?.personaAnalysis as PersonaAnalysis | null,
    role: emailAccount?.role,
  };
}
