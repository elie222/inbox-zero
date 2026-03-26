import { createSlackClient } from "./client";
import { buildAppHomeBlocks } from "./messages/app-home";
import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";

export async function publishAppHome({
  teamId,
  userId,
  logger,
}: {
  teamId: string;
  userId: string;
  logger: Logger;
}): Promise<boolean> {
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
      isConnected: true,
      accessToken: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { accessToken: true },
  });

  if (!channel?.accessToken) {
    logger.warn("No access token for App Home publish", { teamId });
    return false;
  }

  const client = createSlackClient(channel.accessToken);
  const view = buildAppHomeBlocks();

  await client.views.publish({
    user_id: userId,
    view,
  });

  return true;
}
