"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  updateSlackChannelBody,
  updateChannelFeaturesBody,
  updateEmailDeliveryBody,
  disconnectChannelBody,
  linkSlackWorkspaceBody,
  createMessagingLinkCodeBody,
} from "@/utils/actions/messaging-channels.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  createSlackClient,
  getChannelInfo,
  sendChannelConfirmation,
  lookupSlackUserByEmail,
} from "@inboxzero/slack";
import { generateMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code";
import { env } from "@/env";
import { sendSlackOnboardingDirectMessageWithLogging } from "@/utils/slack/send-onboarding-direct-message";

export const updateSlackChannelAction = actionClient
  .metadata({ name: "updateSlackChannel" })
  .inputSchema(updateSlackChannelBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { channelId, targetId },
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

      if (!channel.accessToken) {
        throw new SafeError("Messaging channel has no access token");
      }

      const client = createSlackClient(channel.accessToken);
      const channelInfo = await getChannelInfo(client, targetId);

      if (!channelInfo) {
        throw new SafeError("Could not find the selected Slack channel");
      }

      if (!channelInfo.isPrivate) {
        throw new SafeError(
          "Only private channels are allowed. Please select a private channel.",
        );
      }

      await prisma.messagingChannel.update({
        where: { id: channelId },
        data: {
          channelId: targetId,
          channelName: channelInfo.name,
        },
      });

      try {
        await sendChannelConfirmation({
          accessToken: channel.accessToken,
          channelId: targetId,
        });
      } catch (error) {
        logger.error("Failed to send channel confirmation", { error });
      }
    },
  );

export const updateChannelFeaturesAction = actionClient
  .metadata({ name: "updateChannelFeatures" })
  .inputSchema(updateChannelFeaturesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { channelId, sendMeetingBriefs, sendDocumentFilings },
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

      const enablingFeature =
        sendMeetingBriefs === true || sendDocumentFilings === true;
      if (enablingFeature && !channel.channelId) {
        throw new SafeError(
          "Please select a target channel before enabling features",
        );
      }

      await prisma.messagingChannel.update({
        where: { id: channelId },
        data: {
          ...(sendMeetingBriefs !== undefined && { sendMeetingBriefs }),
          ...(sendDocumentFilings !== undefined && { sendDocumentFilings }),
        },
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
        sendDocumentFilings: false,
      },
    });
  });

export const linkSlackWorkspaceAction = actionClient
  .metadata({ name: "linkSlackWorkspace" })
  .inputSchema(linkSlackWorkspaceBody)
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, logger },
      parsedInput: { teamId },
    }) => {
      const existing = await prisma.messagingChannel.findUnique({
        where: {
          emailAccountId_provider_teamId: {
            emailAccountId,
            provider: MessagingProvider.SLACK,
            teamId,
          },
        },
      });
      if (existing?.isConnected) {
        throw new SafeError("Workspace already connected");
      }

      // Find an org-mate's connected channel for the same Slack workspace
      const orgMateChannel = await prisma.messagingChannel.findFirst({
        where: {
          provider: MessagingProvider.SLACK,
          teamId,
          isConnected: true,
          accessToken: { not: null },
          NOT: { emailAccountId },
          emailAccount: {
            members: {
              some: {
                organization: {
                  members: { some: { emailAccountId } },
                },
              },
            },
          },
        },
        select: {
          accessToken: true,
          botUserId: true,
          teamName: true,
        },
      });

      if (!orgMateChannel?.accessToken) {
        throw new SafeError(
          "No connected workspace found in your organization",
        );
      }

      const client = createSlackClient(orgMateChannel.accessToken);
      const slackUser = await lookupSlackUserByEmail(
        client,
        emailAccount.email,
      );

      if (!slackUser) {
        throw new SafeError(
          "Could not find your Slack account. Your Inbox Zero email may not match your Slack profile email.",
        );
      }

      await prisma.messagingChannel.upsert({
        where: {
          emailAccountId_provider_teamId: {
            emailAccountId,
            provider: MessagingProvider.SLACK,
            teamId,
          },
        },
        update: {
          teamName: orgMateChannel.teamName,
          accessToken: orgMateChannel.accessToken,
          providerUserId: slackUser.id,
          botUserId: orgMateChannel.botUserId,
          isConnected: true,
        },
        create: {
          provider: MessagingProvider.SLACK,
          teamId,
          teamName: orgMateChannel.teamName,
          accessToken: orgMateChannel.accessToken,
          providerUserId: slackUser.id,
          botUserId: orgMateChannel.botUserId,
          emailAccountId,
          isConnected: true,
        },
      });

      await sendSlackOnboardingDirectMessageWithLogging({
        accessToken: orgMateChannel.accessToken,
        userId: slackUser.id,
        teamId,
        logger,
      });

      logger.info("Slack workspace linked via org-mate token", { teamId });
    },
  );

export const createMessagingLinkCodeAction = actionClient
  .metadata({ name: "createMessagingLinkCode" })
  .inputSchema(createMessagingLinkCodeBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { provider } }) => {
    if (provider === "TEAMS") {
      if (!env.TEAMS_BOT_APP_ID || !env.TEAMS_BOT_APP_PASSWORD) {
        throw new SafeError("Teams integration is not configured");
      }
    } else if (!env.TELEGRAM_BOT_TOKEN) {
      throw new SafeError("Telegram integration is not configured");
    }

    const code = generateMessagingLinkCode({
      emailAccountId,
      provider,
    });

    return {
      code,
      provider,
      expiresInSeconds: 10 * 60,
    };
  });
