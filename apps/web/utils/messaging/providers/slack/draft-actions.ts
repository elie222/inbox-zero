import prisma from "@/utils/prisma";
import type { WebClient } from "@slack/web-api";
import { DraftNotificationStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import {
  buildDraftSentBlocks,
  buildDraftDismissedBlocks,
} from "@/utils/messaging/providers/slack/messages/draft-notification";

export async function handleDraftSend({
  providerMessageId,
  slackClient,
  channelId,
  slackUserId,
  logger,
}: {
  providerMessageId: string;
  slackClient: WebClient;
  channelId: string;
  slackUserId: string | undefined;
  logger: Logger;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
    logger,
  );
  authorizeSlackUser(notification, slackUserId);

  await provider.sendDraft(notification.draftId);

  await prisma.pendingDraftNotification.update({
    where: { providerMessageId },
    data: { status: DraftNotificationStatus.SENT },
  });

  await slackClient.chat.update({
    channel: channelId,
    ts: providerMessageId,
    blocks: buildDraftSentBlocks({
      recipient: notification.recipient,
      subject: notification.subject,
    }),
    text: `Draft sent to ${notification.recipient}`,
  });

  logger.info("Draft sent via Slack", { providerMessageId });
}

export async function handleDraftEdit({
  providerMessageId,
  triggerId,
  slackClient,
  slackUserId,
  logger,
}: {
  providerMessageId: string;
  triggerId: string;
  slackClient: WebClient;
  slackUserId: string | undefined;
  logger: Logger;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
    logger,
  );
  authorizeSlackUser(notification, slackUserId);

  const draft = await provider.getDraft(notification.draftId);
  const currentBody = draft?.textPlain ?? draft?.textHtml ?? "";

  await slackClient.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "draft_edit_modal",
      private_metadata: providerMessageId,
      title: { type: "plain_text", text: "Edit draft" },
      submit: { type: "plain_text", text: "Send" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*To:* ${notification.recipient}\n*Subject:* ${notification.subject}`,
          },
        },
        {
          type: "input",
          block_id: "draft_body_block",
          label: { type: "plain_text", text: "Message" },
          element: {
            type: "plain_text_input",
            action_id: "draft_body",
            multiline: true,
            initial_value: currentBody,
          },
        },
      ],
    },
  });
}

export async function handleDraftDismiss({
  providerMessageId,
  slackClient,
  channelId,
  slackUserId,
  logger,
}: {
  providerMessageId: string;
  slackClient: WebClient;
  channelId: string;
  slackUserId: string | undefined;
  logger: Logger;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
    logger,
  );
  authorizeSlackUser(notification, slackUserId);

  try {
    await provider.deleteDraft(notification.draftId);
  } catch (error) {
    logger.warn("Failed to delete draft (may already be deleted)", { error });
  }

  await prisma.pendingDraftNotification.update({
    where: { providerMessageId },
    data: { status: DraftNotificationStatus.DISMISSED },
  });

  await slackClient.chat.update({
    channel: channelId,
    ts: providerMessageId,
    blocks: buildDraftDismissedBlocks({
      recipient: notification.recipient,
      subject: notification.subject,
    }),
    text: `Draft dismissed for ${notification.recipient}`,
  });

  logger.info("Draft dismissed via Slack", { providerMessageId });
}

export async function handleDraftEditSubmit({
  providerMessageId,
  newBody,
  slackClient,
  slackUserId,
  logger,
}: {
  providerMessageId: string;
  newBody: string;
  slackClient: WebClient;
  slackUserId: string | undefined;
  logger: Logger;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
    logger,
  );
  authorizeSlackUser(notification, slackUserId);

  const htmlBody = plainTextToHtml(newBody);
  await provider.updateDraft(notification.draftId, { messageHtml: htmlBody });
  await provider.sendDraft(notification.draftId);

  await prisma.pendingDraftNotification.update({
    where: { providerMessageId },
    data: { status: DraftNotificationStatus.SENT },
  });

  const channel = await prisma.messagingChannel.findUnique({
    where: { id: notification.messagingChannelId },
    select: { channelId: true },
  });

  if (channel?.channelId) {
    await slackClient.chat.update({
      channel: channel.channelId,
      ts: providerMessageId,
      blocks: buildDraftSentBlocks({
        recipient: notification.recipient,
        subject: notification.subject,
        edited: true,
      }),
      text: `Draft sent (edited) to ${notification.recipient}`,
    });
  }

  logger.info("Edited draft sent via Slack", { providerMessageId });
}

async function getNotificationAndProvider(
  providerMessageId: string,
  logger: Logger,
) {
  const notification = await prisma.pendingDraftNotification.findUnique({
    where: { providerMessageId },
    include: {
      emailAccount: {
        select: {
          id: true,
          account: { select: { provider: true } },
        },
      },
      messagingChannel: {
        select: { providerUserId: true, accessToken: true },
      },
    },
  });

  if (!notification) throw new Error("Draft notification not found");
  if (notification.status !== DraftNotificationStatus.PENDING) {
    throw new Error(`Draft already ${notification.status.toLowerCase()}`);
  }

  const accountProvider = notification.emailAccount.account?.provider;
  if (!accountProvider) throw new Error("No provider found for email account");

  const provider = await createEmailProvider({
    emailAccountId: notification.emailAccount.id,
    provider: accountProvider,
    logger,
  });

  return { notification, provider };
}

function authorizeSlackUser(
  notification: { messagingChannel: { providerUserId: string | null } },
  slackUserId: string | undefined,
) {
  if (
    !slackUserId ||
    notification.messagingChannel.providerUserId !== slackUserId
  ) {
    throw new Error("Unauthorized: Slack user does not own this draft");
  }
}

function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
