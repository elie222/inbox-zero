import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import type { Knowledge } from "@prisma/client";

export type GetKnowledgeResponse = {
  items: Knowledge[];
};

export const GET = withError(async () => {
  const session = await auth();
  const emailAccountId = session?.user.email;
  if (!emailAccountId) return NextResponse.json({ error: "Not authenticated" });

  const items = await prisma.knowledge.findMany({
    where: { emailAccountId },
    orderBy: { updatedAt: "desc" },
  });

  const result: GetKnowledgeResponse = { items };

  return NextResponse.json(result);
});
