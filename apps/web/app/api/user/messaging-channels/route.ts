import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { env } from "@/env";
import type { MessagingProvider } from "@/generated/prisma/enums";

export type GetMessagingChannelsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/messaging-channels",
  async (request) => {
    const { emailAccountId } = request.auth;
    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const channels = await prisma.messagingChannel.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      provider: true,
      teamName: true,
      channelId: true,
      channelName: true,
      isConnected: true,
      sendMeetingBriefs: true,
      sendDocumentFilings: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { channels, availableProviders: getAvailableProviders() };
}

function getAvailableProviders(): MessagingProvider[] {
  const providers: MessagingProvider[] = [];
  if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) providers.push("SLACK");
  return providers;
}
