import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import { getMessagingChatSdkBot } from "@/utils/messaging/chat-sdk/bot";
import type { Logger } from "@/utils/logger";

export async function handleSlackAppUninstalled({
  teamId,
  logger,
}: {
  teamId: string;
  logger: Logger;
}): Promise<void> {
  logger.info("Handling Slack app uninstall", { teamId });

  const result = await prisma.messagingChannel.updateMany({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
    },
    data: {
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      channelId: null,
      channelName: null,
      sendMeetingBriefs: false,
      sendDocumentFilings: false,
    },
  });

  logger.info("Disconnected Slack channels", {
    teamId,
    count: result.count,
  });

  try {
    const { bot, adapters } = getMessagingChatSdkBot();
    if (adapters.slack) {
      await bot.initialize();
      await adapters.slack.deleteInstallation(teamId);
    }
  } catch (error) {
    logger.warn("Failed to remove Chat SDK Slack installation", {
      teamId,
      error,
    });
  }
}
