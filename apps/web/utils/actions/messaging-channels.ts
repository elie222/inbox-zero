"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  updateChannelTargetBody,
  updateChannelFeaturesBody,
  updateEmailDeliveryBody,
  disconnectChannelBody,
} from "@/utils/actions/messaging-channels.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { sendChannelConfirmation } from "@inboxzero/slack";

export const updateChannelTargetAction = actionClient
  .metadata({ name: "updateChannelTarget" })
  .inputSchema(updateChannelTargetBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { channelId, targetId, targetName },
    }) => {
      const channel = await prisma.messagingChannel.findUnique({
        where: { id: channelId },
      });

      if (!channel || channel.emailAccountId !== emailAccountId) {
        throw new SafeError("Messaging channel not found");
      }

      if (!channel.isConnected) {
        throw new SafeError("Messaging channel is not connected");
      }

      await prisma.messagingChannel.update({
        where: { id: channelId },
        data: {
          channelId: targetId,
          channelName: targetName,
        },
      });

      if (channel.accessToken) {
        try {
          await sendChannelConfirmation({
            accessToken: channel.accessToken,
            channelId: targetId,
          });
        } catch (error) {
          logger.error("Failed to send channel confirmation", { error });
        }
      }
    },
  );

export const updateChannelFeaturesAction = actionClient
  .metadata({ name: "updateChannelFeatures" })
  .inputSchema(updateChannelFeaturesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { channelId, sendMeetingBriefs },
    }) => {
      const channel = await prisma.messagingChannel.findUnique({
        where: { id: channelId },
      });

      if (!channel || channel.emailAccountId !== emailAccountId) {
        throw new SafeError("Messaging channel not found");
      }

      if (!channel.isConnected) {
        throw new SafeError("Messaging channel is not connected");
      }

      if (sendMeetingBriefs && !channel.channelId) {
        throw new SafeError(
          "Please select a target channel before enabling briefs",
        );
      }

      await prisma.messagingChannel.update({
        where: { id: channelId },
        data: { sendMeetingBriefs },
      });
    },
  );

export const updateEmailDeliveryAction = actionClient
  .metadata({ name: "updateEmailDelivery" })
  .inputSchema(updateEmailDeliveryBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { sendEmail } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { meetingBriefsSendEmail: sendEmail },
    });
  });

export const disconnectChannelAction = actionClient
  .metadata({ name: "disconnectChannel" })
  .inputSchema(disconnectChannelBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { channelId } }) => {
    const channel = await prisma.messagingChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.emailAccountId !== emailAccountId) {
      throw new SafeError("Messaging channel not found");
    }

    await prisma.messagingChannel.update({
      where: { id: channelId },
      data: {
        isConnected: false,
        channelId: null,
        channelName: null,
        sendMeetingBriefs: false,
      },
    });
  });
