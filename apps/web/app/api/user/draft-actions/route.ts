import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { ActionType } from "@prisma/client";

export type DraftActionsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.email;
  if (!email)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
