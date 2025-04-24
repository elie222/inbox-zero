import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { ActionType } from "@prisma/client";

export type DraftActionsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const response = await getData({ email });

  return NextResponse.json(response);
});

async function getData({ email }: { email: string }) {
  const executedActions = await prisma.executedAction.findMany({
    where: {
      executedRule: { emailAccountId: email },
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
