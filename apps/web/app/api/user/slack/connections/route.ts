import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetSlackConnectionResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/slack/connections",
  async (request) => {
    const { emailAccountId } = request.auth;
    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const connection = await prisma.slackConnection.findFirst({
    where: {
      emailAccountId,
      isConnected: true,
    },
    select: {
      id: true,
      teamId: true,
      teamName: true,
      channelId: true,
      channelName: true,
      isConnected: true,
    },
  });

  return { connection };
}
