import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  resolveSlackDestination,
  sendDocumentFiledToSlack,
  sendDocumentAskToSlack,
} from "@/utils/messaging/providers/slack/send";
import type { Logger } from "@/utils/logger";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import { getMessagingDeliveryTargetWhere } from "@/utils/messaging/delivery-target";

export async function sendFilingSlackNotifications({
  emailAccountId,
  filingId,
  senderEmail,
  logger,
}: {
  emailAccountId: string;
  filingId: string;
  senderEmail?: string | null;
  logger: Logger;
}): Promise<void> {
  const log = logger.with({ action: "sendFilingSlackNotifications", filingId });

  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      sendDocumentFilings: true,
      ...getMessagingDeliveryTargetWhere(),
    },
    select: {
      provider: true,
      accessToken: true,
      teamId: true,
      channelId: true,
      providerUserId: true,
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

  const deliveryPromises: Promise<unknown>[] = [];

  for (const channel of channels) {
    switch (channel.provider) {
      case MessagingProvider.SLACK: {
        if (!channel.accessToken) continue;
        const destination = await resolveSlackDestination({
          accessToken: channel.accessToken,
          channelId: channel.channelId,
          providerUserId: channel.providerUserId,
        }).catch((error: unknown) => {
          log.error("Slack destination resolution failed", { error });
          return null;
        });
        if (!destination) continue;

        if (filing.wasAsked) {
          deliveryPromises.push(
            sendDocumentAskToSlack({
              accessToken: channel.accessToken,
              channelId: destination,
              filename: filing.filename,
              reasoning: filing.reasoning,
              senderEmail,
            }),
          );
        } else {
          deliveryPromises.push(
            sendDocumentFiledToSlack({
              accessToken: channel.accessToken,
              channelId: destination,
              filename: filing.filename,
              folderPath: filing.folderPath,
              driveProvider: filing.driveConnection.provider,
              senderEmail,
              fileId: filing.fileId,
            }),
          );
        }
        break;
      }
      case MessagingProvider.TEAMS:
      case MessagingProvider.TELEGRAM: {
        deliveryPromises.push(
          sendAutomationMessage({
            channel,
            text: filing.wasAsked
              ? formatDocumentAskText({
                  filename: filing.filename,
                  reasoning: filing.reasoning,
                  senderEmail,
                })
              : formatDocumentFiledText({
                  filename: filing.filename,
                  folderPath: filing.folderPath,
                  senderEmail,
                }),
            logger: log,
          }),
        );
        break;
      }
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

function formatDocumentAskText({
  filename,
  reasoning,
  senderEmail,
}: {
  filename: string;
  reasoning: string | null;
  senderEmail?: string | null;
}) {
  const fromPart = senderEmail ? ` from ${senderEmail}` : "";
  const reasonPart = reasoning ? ` — ${reasoning}` : "";
  return `📄 Where should I file ${filename}${fromPart}?${reasonPart}`;
}

function formatDocumentFiledText({
  filename,
  folderPath,
  senderEmail,
}: {
  filename: string;
  folderPath: string;
  senderEmail?: string | null;
}) {
  const fromPart = senderEmail ? ` from ${senderEmail}` : "";
  return `📨 Filed ${filename}${fromPart} to ${folderPath}`;
}
