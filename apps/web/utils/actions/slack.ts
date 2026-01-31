"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  updateSlackChannelBody,
  updateMeetingBriefsDeliveryBody,
  disconnectSlackBody,
} from "@/utils/actions/slack.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const updateSlackChannelAction = actionClient
  .metadata({ name: "updateSlackChannel" })
  .inputSchema(updateSlackChannelBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { connectionId, channelId, channelName },
    }) => {
      const connection = await prisma.slackConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
          isConnected: true,
        },
      });

      if (!connection) {
        throw new SafeError("Slack connection not found");
      }

      await prisma.slackConnection.update({
        where: { id: connectionId },
        data: {
          channelId,
          channelName,
        },
      });
    },
  );

export const updateMeetingBriefsDeliveryAction = actionClient
  .metadata({ name: "updateMeetingBriefsDelivery" })
  .inputSchema(updateMeetingBriefsDeliveryBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { sendEmail, sendSlack },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          meetingBriefsSendEmail: sendEmail,
          meetingBriefsSendSlack: sendSlack,
        },
      });
    },
  );

export const disconnectSlackAction = actionClient
  .metadata({ name: "disconnectSlack" })
  .inputSchema(disconnectSlackBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.slackConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Slack connection not found");
      }

      await prisma.slackConnection.update({
        where: { id: connectionId },
        data: {
          isConnected: false,
          channelId: null,
          channelName: null,
        },
      });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          meetingBriefsSendSlack: false,
        },
      });
    },
  );
