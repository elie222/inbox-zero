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
      providerUserId: true,
      channelId: true,
      channelName: true,
      isConnected: true,
      sendMeetingBriefs: true,
      sendDocumentFilings: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    channels: channels.map(({ providerUserId, ...channel }) => ({
      ...channel,
      hasSendDestination: Boolean(providerUserId || channel.channelId),
    })),
    availableProviders: getAvailableProviders(),
  };
}

function getAvailableProviders(): MessagingProvider[] {
  const providers: MessagingProvider[] = [];
  if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) providers.push("SLACK");
  if (env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET) {
    providers.push("WHATSAPP");
  }
  if (env.TELEGRAM_WEBHOOK_SECRET) providers.push("TELEGRAM");
  return providers;
}
