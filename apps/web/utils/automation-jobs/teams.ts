import { MessagingProvider } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { sendTeamsMessageToTarget } from "@/utils/teams/send";
import { getTeamsAccessToken } from "@/utils/teams/token";
import { AutomationJobConfigurationError } from "./slack";

type TeamsMessagingChannel = {
  id: string;
  provider: MessagingProvider;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  channelId: string | null;
};

export async function sendAutomationMessageToTeams({
  channel,
  text,
  logger,
}: {
  channel: TeamsMessagingChannel;
  text: string;
  logger: Logger;
}) {
  if (channel.provider !== MessagingProvider.TEAMS) {
    throw new AutomationJobConfigurationError(
      "Only Teams messaging channels are supported",
    );
  }

  if (!channel.channelId) {
    throw new AutomationJobConfigurationError(
      "No Teams destination available for automation job",
    );
  }

  const accessToken = await getTeamsAccessToken({ channel, logger });

  const result = await sendTeamsMessageToTarget({
    accessToken,
    targetId: channel.channelId,
    text,
  });

  logger.info("Teams automation message sent", {
    destination: channel.channelId,
  });

  return {
    channelId: channel.channelId,
    messageId: result.messageId,
  };
}
