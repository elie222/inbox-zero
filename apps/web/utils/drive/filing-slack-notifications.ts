import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  sendDocumentFiledToSlack,
  sendDocumentAskToSlack,
} from "@inboxzero/slack";
import type { Logger } from "@/utils/logger";
import {
  sendDocumentAskToTeams,
  sendDocumentFiledToTeams,
} from "@/utils/teams/send";
import { getTeamsAccessToken } from "@/utils/teams/token";

export async function sendFilingMessagingNotifications({
  emailAccountId,
  filingId,
  logger,
}: {
  emailAccountId: string;
  filingId: string;
  logger: Logger;
}): Promise<void> {
  const log = logger.with({
    action: "sendFilingMessagingNotifications",
    filingId,
  });

  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      sendDocumentFilings: true,
      channelId: { not: null },
    },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      channelId: true,
    },
  });

  if (channels.length === 0) return;

  const filing = await prisma.documentFiling.findUnique({
    where: { id: filingId },
    include: {
      driveConnection: { select: { provider: true } },
    },
  });

  if (!filing) {
    log.error("Filing not found for messaging notification");
    return;
  }

  const deliveryPromises: Promise<void>[] = [];

  for (const channel of channels) {
    if (!channel.channelId) continue;

    switch (channel.provider) {
      case MessagingProvider.SLACK:
        if (!channel.accessToken) continue;
        if (filing.wasAsked) {
          deliveryPromises.push(
            sendDocumentAskToSlack({
              accessToken: channel.accessToken,
              channelId: channel.channelId,
              filename: filing.filename,
              reasoning: filing.reasoning,
            }),
          );
        } else {
          deliveryPromises.push(
            sendDocumentFiledToSlack({
              accessToken: channel.accessToken,
              channelId: channel.channelId,
              filename: filing.filename,
              folderPath: filing.folderPath,
              driveProvider: filing.driveConnection.provider,
            }),
          );
        }
        break;
      case MessagingProvider.TEAMS: {
        deliveryPromises.push(
          (async () => {
            const accessToken = await getTeamsAccessToken({
              channel,
              logger: log,
            });

            if (filing.wasAsked) {
              await sendDocumentAskToTeams({
                accessToken,
                targetId: channel.channelId,
                filename: filing.filename,
                reasoning: filing.reasoning,
              });
            } else {
              await sendDocumentFiledToTeams({
                accessToken,
                targetId: channel.channelId,
                filename: filing.filename,
                folderPath: filing.folderPath,
                driveProvider: filing.driveConnection.provider,
              });
            }
          })(),
        );
        break;
      }
    }
  }

  const results = await Promise.allSettled(deliveryPromises);
  const failures = results.filter((r) => r.status === "rejected");

  for (const failure of failures) {
    log.error("Messaging filing notification failed", {
      reason: (failure as PromiseRejectedResult).reason,
    });
  }
}

// Backward-compatible export while call sites migrate.
export const sendFilingSlackNotifications = sendFilingMessagingNotifications;
