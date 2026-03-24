import { MessagingNotificationEventType } from "@/generated/prisma/enums";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

const MESSAGING_NOTIFICATION_TOPIC = "messaging-notifications-execute";
const MESSAGING_NOTIFICATION_QUEUE = "messaging-notifications";

export async function emitOutboundProposalReadyNotification({
  emailAccountId,
  outboundProposalId,
  executedActionId,
  logger,
}: {
  emailAccountId: string;
  outboundProposalId: string;
  executedActionId: string;
  logger: Logger;
}) {
  const notification = await prisma.messagingNotification.upsert({
    where: {
      dedupeKey: `outbound-proposal-ready:${executedActionId}`,
    },
    create: {
      emailAccountId,
      eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
      sourceType: "EXECUTED_ACTION",
      sourceId: executedActionId,
      payload: { outboundProposalId },
      dedupeKey: `outbound-proposal-ready:${executedActionId}`,
    },
    update: {},
    select: { id: true },
  });

  await enqueueBackgroundJob({
    topic: MESSAGING_NOTIFICATION_TOPIC,
    body: { notificationId: notification.id },
    qstash: {
      queueName: MESSAGING_NOTIFICATION_QUEUE,
      parallelism: 1,
      path: "/api/messaging-notifications/execute/queue",
    },
    logger,
  });

  return notification;
}
