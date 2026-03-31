"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  updateSlackChannelBody,
  updateChannelFeaturesBody,
  updateEmailDeliveryBody,
  disconnectChannelBody,
  linkSlackWorkspaceBody,
  createMessagingLinkCodeBody,
  toggleRuleChannelBody,
} from "@/utils/actions/messaging-channels.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { ActionType, MessagingProvider } from "@/generated/prisma/enums";
import { hasMessagingDeliveryTarget } from "@/utils/messaging/delivery-target";

const MESSAGING_ACTION_TYPES = [
  ActionType.NOTIFY_MESSAGING_CHANNEL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
] as const;
import { generateMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code";
import { env } from "@/env";
import { getChannelInfo } from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  sendChannelConfirmation,
  SLACK_DM_CHANNEL_SENTINEL,
} from "@/utils/messaging/providers/slack/send";
import { sendSlackOnboardingDirectMessageWithLogging } from "@/utils/messaging/providers/slack/send-onboarding-direct-message";
import { lookupSlackUserByEmail } from "@/utils/messaging/providers/slack/users";
import { callTelegramBotApi } from "@/utils/messaging/providers/telegram/api";

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

      if (targetId === "dm") {
        if (!channel.providerUserId) {
          throw new SafeError(
            "Direct messages are not available for this channel",
          );
        }

        await prisma.messagingChannel.update({
          where: { id: channelId },
          data: { channelId: SLACK_DM_CHANNEL_SENTINEL, channelName: null },
        });
        return;
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
          botUserId: channel.botUserId,
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
      if (enablingFeature && !hasMessagingDeliveryTarget(channel)) {
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
    const botUrl =
      provider === "TELEGRAM" ? await getTelegramBotUrl() : undefined;

    return {
      code,
      provider,
      expiresInSeconds: 10 * 60,
      ...(botUrl ? { botUrl } : {}),
    };
  });

export const toggleRuleChannelAction = actionClient
  .metadata({ name: "toggleRuleChannel" })
  .inputSchema(toggleRuleChannelBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        ruleId,
        messagingChannelId,
        enabled,
        actionType: requestedType,
      },
    }) => {
      const [rule, channel] = await Promise.all([
        prisma.rule.findUnique({
          where: { id: ruleId },
          select: { emailAccountId: true },
        }),
        prisma.messagingChannel.findUnique({
          where: { id: messagingChannelId },
          select: {
            emailAccountId: true,
            isConnected: true,
            provider: true,
            teamId: true,
            channelId: true,
            providerUserId: true,
          },
        }),
      ]);

      if (!rule || rule.emailAccountId !== emailAccountId) {
        throw new SafeError("Rule not found");
      }
      if (!channel || channel.emailAccountId !== emailAccountId) {
        throw new SafeError("Messaging channel not found");
      }

      const actionType: ActionType =
        requestedType ?? ActionType.NOTIFY_MESSAGING_CHANNEL;

      if (enabled) {
        if (!channel.isConnected) {
          throw new SafeError("Messaging channel is not connected");
        }
        if (!hasMessagingDeliveryTarget(channel)) {
          throw new SafeError(
            "Please select a target channel before enabling notifications",
          );
        }

        // Remove any existing messaging channel actions for this rule+channel
        await prisma.action.deleteMany({
          where: {
            ruleId,
            messagingChannelId,
            type: { in: [...MESSAGING_ACTION_TYPES] },
          },
        });

        await prisma.action.create({
          data: {
            type: actionType,
            ruleId,
            messagingChannelId,
          },
        });
      } else {
        await prisma.action.deleteMany({
          where: {
            ruleId,
            messagingChannelId,
            type: { in: [...MESSAGING_ACTION_TYPES] },
          },
        });
      }
    },
  );

async function getTelegramBotUrl() {
  if (!env.TELEGRAM_BOT_TOKEN) return undefined;

  try {
    const result = await callTelegramBotApi<{ username?: string }>({
      botToken: env.TELEGRAM_BOT_TOKEN,
      apiMethod: "getMe",
      requestMethod: "GET",
    });

    const username = result.username?.trim().replace(/^@+/, "");
    if (!username) return undefined;

    return `https://t.me/${username}`;
  } catch {
    return undefined;
  }
}
