"use server";

import {
  DraftMaterializationMode,
  MessagingNotificationEventType,
  MessagingProvider,
} from "@/generated/prisma/enums";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { saveDraftReviewSettingsBody } from "@/utils/actions/draft-review-settings.validation";

export const saveDraftReviewSettingsAction = actionClient
  .metadata({ name: "saveDraftReviewSettings" })
  .inputSchema(saveDraftReviewSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { enabled, messagingChannelId, draftMaterializationMode },
    }) => {
      const nextMaterializationMode =
        enabled ||
        draftMaterializationMode !== DraftMaterializationMode.MESSAGING_ONLY
          ? draftMaterializationMode
          : DraftMaterializationMode.MAILBOX_DRAFT;

      if (!enabled) {
        await prisma.messagingNotificationSubscription.deleteMany({
          where: {
            emailAccountId,
            eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
          },
        });

        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: {
            draftMaterializationMode: nextMaterializationMode,
          },
        });

        return { success: true };
      }

      if (!messagingChannelId) {
        throw new SafeError("Select a Slack destination first");
      }

      const channel = await prisma.messagingChannel.findFirst({
        where: {
          id: messagingChannelId,
          emailAccountId,
          provider: MessagingProvider.SLACK,
          isConnected: true,
        },
        select: {
          id: true,
          channelId: true,
        },
      });

      if (!channel) {
        throw new SafeError("Slack destination not found");
      }

      if (!channel.channelId) {
        throw new SafeError(
          "Choose a Slack DM or private channel in Connected Apps before enabling draft reviews",
        );
      }

      await prisma.messagingNotificationSubscription.deleteMany({
        where: {
          emailAccountId,
          eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
          NOT: { messagingChannelId },
        },
      });

      await prisma.messagingNotificationSubscription.upsert({
        where: {
          emailAccountId_messagingChannelId_eventType: {
            emailAccountId,
            messagingChannelId,
            eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
          },
        },
        create: {
          emailAccountId,
          messagingChannelId,
          eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
          enabled: true,
        },
        update: {
          enabled: true,
        },
      });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          draftMaterializationMode: nextMaterializationMode,
        },
      });

      return { success: true };
    },
  );
