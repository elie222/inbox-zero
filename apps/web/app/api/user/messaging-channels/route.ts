import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { env } from "@/env";
import type { MessagingProvider } from "@/generated/prisma/enums";
import { MessagingRoutePurpose } from "@/generated/prisma/enums";
import { getMessagingRouteSummary } from "@/utils/messaging/routes";

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
      isConnected: true,
      routes: {
        select: {
          purpose: true,
          targetType: true,
          targetId: true,
        },
      },
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
    channels: channels.map(({ routes, ...channel }) => ({
      ...channel,
      canSendAsDm:
        channel.provider === "SLACK" && Boolean(channel.providerUserId),
      destinations: {
        ruleNotifications: getMessagingRouteSummary(
          routes,
          MessagingRoutePurpose.RULE_NOTIFICATIONS,
        ),
        meetingBriefs: getMessagingRouteSummary(
          routes,
          MessagingRoutePurpose.MEETING_BRIEFS,
        ),
        documentFilings: getMessagingRouteSummary(
          routes,
          MessagingRoutePurpose.DOCUMENT_FILINGS,
        ),
      },
    })),
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
