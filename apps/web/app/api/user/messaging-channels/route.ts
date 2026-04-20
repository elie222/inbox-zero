import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { env } from "@/env";
import type { MessagingProvider } from "@/generated/prisma/enums";
import { MessagingRoutePurpose } from "@/generated/prisma/enums";
import {
  isMessagingChannelOperational,
  isOperationalSlackChannel,
} from "@/utils/messaging/channel-validity";
import { getMessagingRouteSummary } from "@/utils/messaging/routes";
import { listChannels } from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";

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
      accessToken: true,
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

  const slackTargetNamesByChannelId = await getSlackTargetNames(channels);

  return {
    channels: channels.map(
      ({ routes, providerUserId, accessToken: _accessToken, ...channel }) => {
        const isConnected = isMessagingChannelOperational({
          ...channel,
          providerUserId,
          accessToken: _accessToken,
        });

        return {
          ...channel,
          isConnected,
          canSendAsDm: channel.provider === "SLACK" && isConnected,
          destinations: {
            ruleNotifications: getMessagingRouteSummary(
              routes,
              MessagingRoutePurpose.RULE_NOTIFICATIONS,
              slackTargetNamesByChannelId[channel.id],
            ),
            meetingBriefs: getMessagingRouteSummary(
              routes,
              MessagingRoutePurpose.MEETING_BRIEFS,
              slackTargetNamesByChannelId[channel.id],
            ),
            documentFilings: getMessagingRouteSummary(
              routes,
              MessagingRoutePurpose.DOCUMENT_FILINGS,
              slackTargetNamesByChannelId[channel.id],
            ),
          },
        };
      },
    ),
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

async function getSlackTargetNames(
  channels: Array<{
    id: string;
    provider: MessagingProvider;
    isConnected: boolean;
    accessToken: string | null;
    providerUserId: string | null;
  }>,
) {
  const targetNamesByChannelId = Object.fromEntries(
    channels.map((channel) => [channel.id, {} as Record<string, string>]),
  );

  const slackChannels = channels.filter(isOperationalSlackChannel);
  const channelIdsByToken = new Map<string, string[]>();
  for (const channel of slackChannels) {
    const accessToken = channel.accessToken;
    if (!accessToken) continue;
    const channelIds = channelIdsByToken.get(accessToken) ?? [];
    channelIds.push(channel.id);
    channelIdsByToken.set(accessToken, channelIds);
  }

  await Promise.all(
    Array.from(channelIdsByToken.entries()).map(
      async ([accessToken, channelIds]) => {
        try {
          const client = createSlackClient(accessToken);
          const targets = await listChannels(client);
          const targetNames = Object.fromEntries(
            targets.map((target) => [target.id, `#${target.name}`]),
          );
          for (const channelId of channelIds) {
            targetNamesByChannelId[channelId] = targetNames;
          }
        } catch {
          // Empty objects were already initialized; nothing to do.
        }
      },
    ),
  );

  return targetNamesByChannelId;
}
