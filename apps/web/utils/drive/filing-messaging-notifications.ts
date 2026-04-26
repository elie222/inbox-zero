import prisma from "@/utils/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import {
  resolveSlackRouteDestination,
  sendDocumentFiledToSlack,
  sendDocumentAskToSlack,
} from "@/utils/messaging/providers/slack/send";
import type { Logger } from "@/utils/logger";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import {
  getMessagingRoute,
  getMessagingRouteWhere,
} from "@/utils/messaging/routes";
import { isMessagingChannelOperational } from "@/utils/messaging/channel-validity";

export async function sendFilingMessagingNotifications({
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
  const log = logger.with({
    action: "sendFilingMessagingNotifications",
    filingId,
  });

  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      ...getMessagingRouteWhere(MessagingRoutePurpose.DOCUMENT_FILINGS),
    },
    select: {
      id: true,
      provider: true,
      isConnected: true,
      accessToken: true,
      teamId: true,
      providerUserId: true,
      routes: {
        select: {
          purpose: true,
          targetType: true,
          targetId: true,
        },
      },
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

  const deliveryPromises: Promise<unknown>[] = [];

  for (const channel of channels) {
    const route = getMessagingRoute(
      channel.routes,
      MessagingRoutePurpose.DOCUMENT_FILINGS,
    );
    if (!route) continue;
    if (!isMessagingChannelOperational(channel)) {
      log.warn("Skipping filing notification for invalid messaging channel", {
        messagingChannelId: channel.id,
        provider: channel.provider,
      });
      continue;
    }

    switch (channel.provider) {
      case MessagingProvider.SLACK: {
        if (!channel.accessToken) continue;
        const destination = await resolveSlackRouteDestination({
          accessToken: channel.accessToken,
          route,
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
            route,
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
    log.error("Filing notification failed", {
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
