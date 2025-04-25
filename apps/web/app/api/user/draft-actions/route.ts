import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ActionType } from "@prisma/client";

export type DraftActionsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const response = await getData({ emailAccountId });

  return NextResponse.json(response);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const executedActions = await prisma.executedAction.findMany({
    where: {
      executedRule: { emailAccountId },
      type: ActionType.DRAFT_EMAIL,
    },
    select: {
      id: true,
      createdAt: true,
      content: true,
      draftId: true,
      wasDraftSent: true,
      draftSendLog: {
        select: {
          sentMessageId: true,
          similarityScore: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return { executedActions };
}
