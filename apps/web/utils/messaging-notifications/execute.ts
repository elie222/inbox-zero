import {
  MessagingNotificationDeliveryStatus,
  MessagingNotificationEventType,
  MessagingProvider,
  OutboundProposalStatus,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { getEmailUrlForMessage } from "@/utils/url";
import { buildOutboundProposalReviewBlocks } from "@/utils/messaging/providers/slack/messages/outbound-proposal-review";
import {
  isSlackDmChannel,
  sendBlocksToSlack,
} from "@/utils/messaging/providers/slack/send";

type OutboundProposalPayload = {
  outboundProposalId?: string;
};

export async function executeMessagingNotification({
  notificationId,
  logger,
}: {
  notificationId: string;
  logger: Logger;
}) {
  const notification = await prisma.messagingNotification.findUnique({
    where: { id: notificationId },
    include: {
      emailAccount: {
        select: {
          id: true,
          email: true,
          name: true,
          account: { select: { provider: true } },
        },
      },
    },
  });

  if (!notification) {
    logger.warn("Messaging notification not found", { notificationId });
    return new Response("Not found", { status: 404 });
  }

  if (
    notification.eventType !==
    MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY
  ) {
    logger.warn("Unsupported messaging notification event type", {
      notificationId,
      eventType: notification.eventType,
    });
    return new Response("Unsupported event type", { status: 200 });
  }

  const payload = notification.payload as OutboundProposalPayload | null;
  const outboundProposalId = payload?.outboundProposalId;
  if (!outboundProposalId) {
    logger.error("Messaging notification missing outbound proposal id", {
      notificationId,
    });
    return new Response("Invalid payload", { status: 400 });
  }

  const [proposal, subscriptions] = await Promise.all([
    prisma.outboundProposal.findUnique({
      where: { id: outboundProposalId },
      include: {
        executedAction: {
          select: {
            id: true,
            content: true,
            staticAttachments: true,
            executedRule: {
              select: {
                ruleId: true,
                rule: {
                  select: {
                    name: true,
                    systemType: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.messagingNotificationSubscription.findMany({
      where: {
        emailAccountId: notification.emailAccountId,
        eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
        enabled: true,
        messagingChannel: {
          provider: MessagingProvider.SLACK,
          isConnected: true,
        },
      },
      include: {
        messagingChannel: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 1,
    }),
  ]);

  if (!proposal) {
    logger.warn("Outbound proposal not found for notification", {
      notificationId,
      outboundProposalId,
    });
    return new Response("Missing proposal", { status: 200 });
  }

  if (proposal.status !== OutboundProposalStatus.OPEN) {
    logger.info("Skipping notification delivery for non-open proposal", {
      notificationId,
      outboundProposalId,
      status: proposal.status,
    });
    return new Response("Skipped", { status: 200 });
  }

  const subscription = subscriptions[0];
  if (!subscription?.messagingChannel.accessToken) {
    logger.info("No active Slack draft review subscription found", {
      notificationId,
      outboundProposalId,
    });
    return new Response("No subscription", { status: 200 });
  }

  const channel = subscription.messagingChannel;
  const accessToken = channel.accessToken;
  if (!accessToken) {
    return new Response("No access token", { status: 200 });
  }

  const resolvedDestination = await sendBlocksToSlack({
    accessToken,
    channelId: channel.channelId,
    providerUserId: channel.providerUserId,
    text: "Review draft reply",
    blocks: buildOutboundProposalReviewBlocks({
      accountName:
        notification.emailAccount.name || notification.emailAccount.email,
      mentionUserId:
        channel.channelId && !isSlackDmChannel(channel.channelId)
          ? channel.providerUserId
          : null,
      originalFrom: proposal.to,
      originalSubject: proposal.subject,
      proposalContent: proposal.currentContent || proposal.originalContent,
      sendValue: encodeOutboundProposalActionValue({
        proposalId: proposal.id,
        revision: proposal.revision,
      }),
      dismissValue: encodeOutboundProposalActionValue({
        proposalId: proposal.id,
        revision: proposal.revision,
      }),
      openInInboxUrl: proposal.draftId
        ? getEmailUrlForMessage(
            proposal.messageId,
            proposal.threadId,
            notification.emailAccount.email,
            notification.emailAccount.account.provider,
          )
        : null,
    }),
  });

  if (!resolvedDestination.ok) {
    await prisma.messagingNotificationDelivery.upsert({
      where: {
        notificationId_messagingChannelId: {
          notificationId: notification.id,
          messagingChannelId: channel.id,
        },
      },
      create: {
        notificationId: notification.id,
        messagingChannelId: channel.id,
        status: MessagingNotificationDeliveryStatus.FAILED,
        error:
          resolvedDestination.error || "Failed to deliver Slack notification",
      },
      update: {
        status: MessagingNotificationDeliveryStatus.FAILED,
        error:
          resolvedDestination.error || "Failed to deliver Slack notification",
      },
    });

    return new Response("Failed", { status: 500 });
  }

  const chatId = `slack-${resolvedDestination.channelId}-${resolvedDestination.ts}`;

  await prisma.$transaction([
    prisma.messagingNotificationDelivery.upsert({
      where: {
        notificationId_messagingChannelId: {
          notificationId: notification.id,
          messagingChannelId: channel.id,
        },
      },
      create: {
        notificationId: notification.id,
        messagingChannelId: channel.id,
        status: MessagingNotificationDeliveryStatus.SENT,
        providerMessageId: resolvedDestination.ts,
        providerThreadId: resolvedDestination.ts,
        chatId,
        sentAt: new Date(),
        error: null,
      },
      update: {
        status: MessagingNotificationDeliveryStatus.SENT,
        providerMessageId: resolvedDestination.ts,
        providerThreadId: resolvedDestination.ts,
        chatId,
        sentAt: new Date(),
        error: null,
      },
    }),
    prisma.outboundProposal.update({
      where: { id: proposal.id },
      data: {
        chatId,
        providerMessageId: resolvedDestination.ts,
        providerThreadId: resolvedDestination.ts,
        messagingChannelId: channel.id,
      },
    }),
  ]);

  return new Response("OK", { status: 200 });
}

export function encodeOutboundProposalActionValue({
  proposalId,
  revision,
}: {
  proposalId: string;
  revision: number;
}) {
  return Buffer.from(JSON.stringify({ proposalId, revision }), "utf8").toString(
    "base64url",
  );
}

export function decodeOutboundProposalActionValue(value: string | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as {
      proposalId?: string;
      revision?: number;
    };

    if (!parsed.proposalId || typeof parsed.revision !== "number") {
      return null;
    }

    return {
      proposalId: parsed.proposalId,
      revision: parsed.revision,
    };
  } catch {
    return null;
  }
}
