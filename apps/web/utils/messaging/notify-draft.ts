import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  postMessageWithJoin,
  resolveSlackDestination,
} from "@/utils/messaging/providers/slack/send";
import { buildDraftNotificationBlocks } from "@/utils/messaging/providers/slack/messages/draft-notification";

export async function notifyDraftOnChannel({
  executedRuleId,
  draftId,
  draftContent,
  draftSubject,
  recipient,
  threadId,
  messageId,
  emailAccountId,
  logger,
}: {
  executedRuleId: string;
  draftId: string;
  draftContent: string | null;
  draftSubject: string | null;
  recipient: string | null;
  threadId: string | null;
  messageId: string | null;
  emailAccountId: string;
  logger: Logger;
}): Promise<void> {
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      emailAccountId,
      isConnected: true,
      notifyActions: { has: "DRAFT_EMAIL" },
    },
  });

  if (!channel?.accessToken || !channel.channelId) {
    return;
  }

  const destination = await resolveSlackDestination({
    accessToken: channel.accessToken,
    channelId: channel.channelId,
    providerUserId: channel.providerUserId,
  });

  if (!destination) {
    logger.warn("Could not resolve Slack destination for draft notification");
    return;
  }

  const blocks = buildDraftNotificationBlocks({
    recipient: recipient ?? "unknown",
    subject: draftSubject ?? "(no subject)",
    draftBody: draftContent ?? "",
  });

  const client = createSlackClient(channel.accessToken);

  const result = await postMessageWithJoin(client, destination, {
    blocks,
    text: `Draft reply ready — To: ${recipient ?? "unknown"}, Subject: ${draftSubject ?? "(no subject)"}`,
  });

  if (!result?.ts) {
    logger.warn("Failed to get message timestamp from Slack");
    return;
  }

  await prisma.pendingDraftNotification.create({
    data: {
      providerMessageId: result.ts,
      draftId,
      threadId: threadId ?? "",
      messageId: messageId ?? "",
      subject: draftSubject ?? "(no subject)",
      recipient: recipient ?? "unknown",
      emailAccountId,
      executedRuleId,
      messagingChannelId: channel.id,
    },
  });

  logger.info("Draft notification posted to Slack", {
    providerMessageId: result.ts,
    draftId,
  });
}
