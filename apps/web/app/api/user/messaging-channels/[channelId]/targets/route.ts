import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { MessagingProvider } from "@/generated/prisma/enums";
import { createSlackClient, listChannels } from "@inboxzero/slack";
import { listTeamsChannels } from "@/utils/teams/channels";
import { getTeamsAccessToken } from "@/utils/teams/token";
import type { Logger } from "@/utils/logger";

export type GetChannelTargetsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/messaging-channels/targets",
  async (request, { params }) => {
    const { channelId } = await params;
    const { emailAccountId } = request.auth;
    const result = await getData({
      emailAccountId,
      channelId,
      logger: request.logger,
    });
    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  channelId,
  logger,
}: {
  emailAccountId: string;
  channelId: string;
  logger: Logger;
}) {
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      id: channelId,
      emailAccountId,
      isConnected: true,
    },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  const hasCredentials =
    Boolean(channel?.accessToken) ||
    (channel?.provider === MessagingProvider.TEAMS &&
      Boolean(channel.refreshToken));

  if (!channel || !hasCredentials) {
    return { targets: [], error: "Channel not found or not connected" };
  }

  try {
    switch (channel.provider) {
      case MessagingProvider.SLACK: {
        if (!channel.accessToken) {
          return { targets: [], error: "Channel not found or not connected" };
        }
        const client = createSlackClient(channel.accessToken);
        const channels = await listChannels(client);
        return {
          targets: channels.map((c) => ({
            id: c.id,
            name: c.name,
            isPrivate: c.isPrivate,
          })),
        };
      }
      case MessagingProvider.TEAMS: {
        const accessToken = await getTeamsAccessToken({ channel, logger });
        const channels = await listTeamsChannels(accessToken);
        return {
          targets: channels.map((c) => ({
            id: c.id,
            name: c.name,
            isPrivate: c.isPrivate,
          })),
        };
      }
      default:
        return { targets: [], error: "Unsupported provider" };
    }
  } catch (error) {
    logger.error("Failed to list channel targets", { error });
    return { targets: [], error: "Failed to list targets" };
  }
}
