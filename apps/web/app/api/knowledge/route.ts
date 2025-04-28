import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import type { Knowledge } from "@prisma/client";

export type GetKnowledgeResponse = {
  items: Knowledge[];
};

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const items = await prisma.knowledge.findMany({
    where: { emailAccountId },
    orderBy: { updatedAt: "desc" },
  });

  const result: GetKnowledgeResponse = { items };

  return NextResponse.json(result);
});
