import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetAgentActivityResponse = Awaited<ReturnType<typeof getActivity>>;

export const GET = withEmailAccount("agent/activity", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getActivity({ emailAccountId });
  return NextResponse.json(result);
});

async function getActivity({ emailAccountId }: { emailAccountId: string }) {
  const actions = await prisma.executedAgentAction.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      createdAt: true,
      actionType: true,
      actionData: true,
      resourceId: true,
      threadId: true,
      messageSubject: true,
      status: true,
      error: true,
      triggeredBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { actions };
}
