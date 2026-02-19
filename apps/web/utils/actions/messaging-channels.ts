"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { env } from "@/env";
import {
  updateSlackChannelBody,
  updateChannelFeaturesBody,
  updateEmailDeliveryBody,
  disconnectChannelBody,
  linkSlackWorkspaceBody,
  connectWhatsAppBody,
  connectTelegramBody,
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
import { getTelegramBot, setTelegramWebhook } from "@inboxzero/telegram";

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

      if (
        channel.provider === MessagingProvider.WHATSAPP ||
        channel.provider === MessagingProvider.TELEGRAM
      ) {
        throw new SafeError(
          `${channel.provider === MessagingProvider.WHATSAPP ? "WhatsApp" : "Telegram"} delivery settings are not supported yet`,
        );
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

export const connectWhatsAppAction = actionClient
  .metadata({ name: "connectWhatsApp" })
  .inputSchema(connectWhatsAppBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: {
        wabaId,
        phoneNumberId,
        accessToken,
        authorizedSender,
        displayName,
      },
    }) => {
      if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || !env.WHATSAPP_APP_SECRET) {
        throw new SafeError("WhatsApp is not configured on this server");
      }

      const phoneNumberData = await getWhatsAppPhoneNumber({
        phoneNumberId,
        accessToken,
      });

      if (phoneNumberData.account.id !== wabaId) {
        throw new SafeError(
          "WhatsApp phone number does not belong to the provided business account",
        );
      }

      const conflictingChannel = await prisma.messagingChannel.findFirst({
        where: {
          provider: MessagingProvider.WHATSAPP,
          teamId: wabaId,
          providerUserId: phoneNumberId,
          isConnected: true,
          emailAccountId: { not: emailAccountId },
        },
        select: { id: true },
      });

      if (conflictingChannel) {
        throw new SafeError(
          "This WhatsApp number is already connected to another email account",
        );
      }

      const authorizedSenderId = normalizeWhatsAppSenderId(authorizedSender);
      if (!authorizedSenderId) {
        throw new SafeError(
          "Enter a valid WhatsApp number for the authorized sender",
        );
      }

      const fallbackName = phoneNumberData.display_phone_number || "WhatsApp";
      const teamName = displayName?.trim() || phoneNumberData.verified_name;

      try {
        await prisma.messagingChannel.upsert({
          where: {
            emailAccountId_provider_teamId: {
              emailAccountId,
              provider: MessagingProvider.WHATSAPP,
              teamId: wabaId,
            },
          },
          update: {
            teamName: teamName || fallbackName,
            accessToken,
            providerUserId: phoneNumberId,
            botUserId: null,
            authorizedSenderId,
            isConnected: true,
            channelId: null,
            channelName: null,
            sendMeetingBriefs: false,
            sendDocumentFilings: false,
          },
          create: {
            provider: MessagingProvider.WHATSAPP,
            teamId: wabaId,
            teamName: teamName || fallbackName,
            accessToken,
            providerUserId: phoneNumberId,
            botUserId: null,
            authorizedSenderId,
            emailAccountId,
            isConnected: true,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new SafeError(
            "This WhatsApp number is already connected to another email account",
          );
        }
        throw error;
      }

      logger.info("Connected WhatsApp channel", {
        emailAccountId,
        provider: MessagingProvider.WHATSAPP,
      });
    },
  );

export const connectTelegramAction = actionClient
  .metadata({ name: "connectTelegram" })
  .inputSchema(connectTelegramBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { botToken, authorizedSender, displayName },
    }) => {
      if (!env.TELEGRAM_WEBHOOK_SECRET) {
        throw new SafeError("Telegram is not configured on this server");
      }

      let bot: Awaited<ReturnType<typeof getTelegramBot>>;
      try {
        bot = await getTelegramBot({ botToken });
      } catch {
        throw new SafeError("Unable to validate Telegram bot token");
      }

      if (!bot.is_bot) {
        throw new SafeError("Telegram token does not belong to a bot");
      }

      const botId = String(bot.id);
      const conflictingChannel = await prisma.messagingChannel.findFirst({
        where: {
          provider: MessagingProvider.TELEGRAM,
          teamId: botId,
          isConnected: true,
          emailAccountId: { not: emailAccountId },
        },
        select: { id: true },
      });

      if (conflictingChannel) {
        throw new SafeError(
          "This Telegram bot is already connected to another email account",
        );
      }

      const authorizedSenderId = normalizeTelegramSenderId(authorizedSender);
      if (!authorizedSenderId) {
        throw new SafeError(
          "Enter a valid Telegram user ID for the authorized sender",
        );
      }

      const webhookUrl = new URL(
        "/api/telegram/webhook",
        env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL,
      );
      webhookUrl.searchParams.set("bot_id", botId);

      try {
        await setTelegramWebhook({
          botToken,
          webhookUrl: webhookUrl.toString(),
          secretToken: env.TELEGRAM_WEBHOOK_SECRET,
        });
      } catch (error) {
        logger.error("Failed to configure Telegram webhook", { error });
        throw new SafeError("Unable to configure Telegram webhook");
      }

      const fallbackName = bot.username ? `@${bot.username}` : bot.first_name;
      const teamName = displayName?.trim() || fallbackName || "Telegram";

      try {
        await prisma.messagingChannel.upsert({
          where: {
            emailAccountId_provider_teamId: {
              emailAccountId,
              provider: MessagingProvider.TELEGRAM,
              teamId: botId,
            },
          },
          update: {
            teamName,
            accessToken: botToken,
            providerUserId: botId,
            botUserId: bot.username || null,
            authorizedSenderId,
            isConnected: true,
            channelId: null,
            channelName: null,
            sendMeetingBriefs: false,
            sendDocumentFilings: false,
          },
          create: {
            provider: MessagingProvider.TELEGRAM,
            teamId: botId,
            teamName,
            accessToken: botToken,
            providerUserId: botId,
            botUserId: bot.username || null,
            authorizedSenderId,
            emailAccountId,
            isConnected: true,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new SafeError(
            "This Telegram bot is already connected to another email account",
          );
        }
        throw error;
      }

      logger.info("Connected Telegram channel", {
        emailAccountId,
        provider: MessagingProvider.TELEGRAM,
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

      logger.info("Slack workspace linked via org-mate token", { teamId });
    },
  );

const whatsappPhoneNumberSchema = z.object({
  id: z.string().min(1),
  display_phone_number: z.string().optional(),
  verified_name: z.string().optional(),
  account: z.object({
    id: z.string().min(1),
  }),
});

const whatsappErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

async function getWhatsAppPhoneNumber({
  phoneNumberId,
  accessToken,
}: {
  phoneNumberId: string;
  accessToken: string;
}) {
  const url = new URL(`https://graph.facebook.com/v22.0/${phoneNumberId}`);
  url.searchParams.set(
    "fields",
    ["id", "display_phone_number", "verified_name", "account"].join(","),
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const raw = await response.json();

  if (!response.ok) {
    const parsedError = whatsappErrorSchema.safeParse(raw);
    const message = parsedError.success
      ? parsedError.data.error?.message
      : undefined;

    throw new SafeError(message || "Unable to validate WhatsApp credentials");
  }

  const parsed = whatsappPhoneNumberSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SafeError("Unexpected response while validating WhatsApp");
  }

  return parsed.data;
}

function normalizeWhatsAppSenderId(value: string): string | null {
  const normalized = value.replaceAll(/\D/g, "");
  if (normalized.length < 8 || normalized.length > 20) return null;
  return normalized;
}

function normalizeTelegramSenderId(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d{5,20}$/.test(normalized)) return null;
  return normalized;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
