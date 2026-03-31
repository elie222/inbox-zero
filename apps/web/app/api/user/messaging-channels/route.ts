import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { env } from "@/env";
import type { MessagingProvider } from "@/generated/prisma/enums";
import { hasMessagingDeliveryTarget } from "@/utils/messaging/delivery-target";
import { isSlackDmChannel } from "@/utils/messaging/providers/slack/send";

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
      teamId: true,
      providerUserId: true,
      channelId: true,
      channelName: true,
      isConnected: true,
      sendMeetingBriefs: true,
      sendDocumentFilings: true,
      actions: {
        select: {
          id: true,
          type: true,
          ruleId: true,
          rule: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    channels: channels.map(({ providerUserId, ...channel }) => {
      const isDm = isSlackDmChannel(channel.channelId);
      return {
        ...channel,
        hasSendDestination: hasMessagingDeliveryTarget({
          provider: channel.provider,
          providerUserId,
          channelId: channel.channelId,
          teamId: channel.teamId,
        }),
        canSendAsDm: channel.provider === "SLACK" && Boolean(providerUserId),
        isDm,
      };
    }),
    availableProviders: getAvailableProviders(),
  };
}

function getAvailableProviders(): MessagingProvider[] {
  const providers: MessagingProvider[] = [];
  if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) providers.push("SLACK");
  if (env.TEAMS_BOT_APP_ID && env.TEAMS_BOT_APP_PASSWORD)
    providers.push("TEAMS");
  if (env.TELEGRAM_BOT_TOKEN) providers.push("TELEGRAM");
  return providers;
}
