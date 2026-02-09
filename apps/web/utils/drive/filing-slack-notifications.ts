import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  sendDocumentFiledToSlack,
  sendDocumentAskToSlack,
} from "@inboxzero/slack";
import type { Logger } from "@/utils/logger";

export async function sendFilingSlackNotifications({
  emailAccountId,
  filingId,
  logger,
}: {
  emailAccountId: string;
  filingId: string;
  logger: Logger;
}): Promise<void> {
  const log = logger.with({ action: "sendFilingSlackNotifications", filingId });

  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      sendDocumentFilings: true,
      channelId: { not: null },
    },
    select: {
      provider: true,
      accessToken: true,
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
    log.error("Filing not found for Slack notification");
    return;
  }

  const deliveryPromises: Promise<void>[] = [];

  for (const channel of channels) {
    if (!channel.accessToken || !channel.channelId) continue;

    switch (channel.provider) {
      case MessagingProvider.SLACK:
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
    }
  }

  const results = await Promise.allSettled(deliveryPromises);
  const failures = results.filter((r) => r.status === "rejected");

  for (const failure of failures) {
    log.error("Slack filing notification failed", {
      reason: (failure as PromiseRejectedResult).reason,
    });
  }
}
