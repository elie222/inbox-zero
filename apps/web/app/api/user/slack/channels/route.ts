import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createSlackClient, listChannels } from "@inboxzero/slack";
import type { Logger } from "@/utils/logger";

export type GetSlackChannelsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/slack/channels", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getData({ emailAccountId, logger: request.logger });
  return NextResponse.json(result);
});

async function getData({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const connection = await prisma.slackConnection.findFirst({
    where: {
      emailAccountId,
      isConnected: true,
    },
    select: {
      accessToken: true,
    },
  });

  if (!connection) {
    return { channels: [], error: "No Slack connection found" };
  }

  try {
    const client = createSlackClient(connection.accessToken);
    const channels = await listChannels(client);
    return { channels };
  } catch (error) {
    logger.error("Failed to list Slack channels", { error });
    return { channels: [], error: "Failed to list channels" };
  }
}
