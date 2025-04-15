import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { ActionType } from "@prisma/client";

export type DraftActionsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const response = await getData(userId);

  return NextResponse.json(response);
});

async function getData(userId: string) {
  const executedActions = await prisma.executedAction.findMany({
    where: {
      executedRule: { userId },
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
