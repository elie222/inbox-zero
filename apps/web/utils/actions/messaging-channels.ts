"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  updateSlackRouteBody,
  updateMessagingFeatureRouteBody,
  updateEmailDeliveryBody,
  disconnectChannelBody,
  linkSlackWorkspaceBody,
  createMessagingLinkCodeBody,
  toggleRuleChannelBody,
} from "@/utils/actions/messaging-channels.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { isNotFoundError } from "@/utils/prisma-helpers";
import {
  ActionType,
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { generateMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code";
import { env } from "@/env";
import {
  getMessagingChannelReconnectMessage,
  isOperationalSlackChannel,
  isMessagingChannelOperational,
} from "@/utils/messaging/channel-validity";
import {
  getChannelInfo,
  listPrivateChannelsForUser,
} from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import { sendChannelConfirmation } from "@/utils/messaging/providers/slack/send";
import { sendSlackOnboardingDirectMessageWithLogging } from "@/utils/messaging/providers/slack/send-onboarding-direct-message";
import { lookupSlackUserByEmail } from "@/utils/messaging/providers/slack/users";
import { callTelegramBotApi } from "@/utils/messaging/providers/telegram/api";
import type { Logger } from "@/utils/logger";
import {
  getMessagingRoute,
  hasMessagingRoute,
  type MessagingFeatureRoutePurpose,
} from "@/utils/messaging/routes";

const MESSAGING_ACTION_TYPES = [
  ActionType.NOTIFY_MESSAGING_CHANNEL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
] as const;

export const updateSlackRouteAction = actionClient
  .metadata({ name: "updateSlackRoute" })
  .inputSchema(updateSlackRouteBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { channelId, purpose, targetId },
    }) => {
      const where = {
        id_emailAccountId: { id: channelId, emailAccountId },
      };

      const channel = await prisma.messagingChannel.findUnique({
        where,
        select: {
          id: true,
          provider: true,
          isConnected: true,
          accessToken: true,
          providerUserId: true,
          botUserId: true,
        },
      });

      if (!channel) {
        throw new SafeError("Messaging channel not found");
      }

      if (channel.provider !== MessagingProvider.SLACK) {
        throw new SafeError("Messaging channel is not Slack");
      }

      if (!isOperationalSlackChannel(channel)) {
        throw new SafeError(
          getMessagingChannelReconnectMessage(channel.provider),
        );
      }

      const target = await resolveSlackRouteTarget({
        accessToken: channel.accessToken,
        providerUserId: channel.providerUserId,
        targetId,
        logger,
      });

      await prisma.messagingRoute.upsert({
        where: {
          messagingChannelId_purpose: {
            messagingChannelId: channelId,
            purpose,
          },
        },
        update: target,
        create: {
          messagingChannelId: channelId,
          purpose,
          ...target,
        },
      });

      if (
        purpose === MessagingRoutePurpose.RULE_NOTIFICATIONS &&
        target.targetType === MessagingRouteTargetType.CHANNEL
      ) {
        try {
          await sendChannelConfirmation({
            accessToken: channel.accessToken,
            channelId: target.targetId,
            botUserId: channel.botUserId,
          });
        } catch (error) {
          logger.error("Failed to send channel confirmation", { error });
        }
      }
    },
  );

export const updateMessagingFeatureRouteAction = actionClient
  .metadata({ name: "updateMessagingFeatureRoute" })
  .inputSchema(updateMessagingFeatureRouteBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { channelId, purpose, enabled },
    }) => {
      const where = {
        id_emailAccountId: { id: channelId, emailAccountId },
      };

      const channel = await prisma.messagingChannel.findUnique({
        where,
        select: {
          id: true,
          provider: true,
          isConnected: true,
          accessToken: true,
          providerUserId: true,
          routes: {
            select: {
              purpose: true,
              targetType: true,
              targetId: true,
            },
          },
        },
      });

      if (!channel) {
        throw new SafeError("Messaging channel not found");
      }

      if (!isMessagingChannelOperational(channel)) {
        throw new SafeError(
          getMessagingChannelReconnectMessage(channel.provider),
        );
      }

      await syncMessagingFeatureRoute({
        messagingChannelId: channel.id,
        routes: channel.routes,
        purpose,
        enabled,
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
    try {
      await prisma.messagingChannel.update({
        where: {
          id_emailAccountId: {
            id: channelId,
            emailAccountId,
          },
        },
        data: {
          isConnected: false,
          routes: {
            deleteMany: {},
          },
        },
      });
    } catch (error) {
      if (isNotFoundError(error))
        throw new SafeError("Messaging channel not found");
      throw error;
    }
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
          where: {
            id_emailAccountId: {
              id: ruleId,
              emailAccountId,
            },
          },
          select: {
            actions: {
              where: { type: ActionType.DRAFT_EMAIL },
              select: { id: true },
              take: 1,
            },
          },
        }),
        prisma.messagingChannel.findUnique({
          where: {
            id_emailAccountId: {
              id: messagingChannelId,
              emailAccountId,
            },
          },
          select: {
            isConnected: true,
            provider: true,
            accessToken: true,
            providerUserId: true,
            routes: {
              select: {
                purpose: true,
                targetType: true,
                targetId: true,
              },
            },
          },
        }),
      ]);

      if (!rule) {
        throw new SafeError("Rule not found");
      }
      if (!channel) {
        throw new SafeError("Messaging channel not found");
      }

      let actionType: ActionType =
        requestedType ?? ActionType.NOTIFY_MESSAGING_CHANNEL;
      const hasDraftEmailAction = (rule.actions?.length ?? 0) > 0;
      if (
        actionType === ActionType.DRAFT_MESSAGING_CHANNEL &&
        !hasDraftEmailAction
      ) {
        actionType = ActionType.NOTIFY_MESSAGING_CHANNEL;
      }

      if (enabled) {
        if (!isMessagingChannelOperational(channel)) {
          throw new SafeError(
            getMessagingChannelReconnectMessage(channel.provider),
          );
        }
        if (
          !hasMessagingRoute(
            channel.routes,
            MessagingRoutePurpose.RULE_NOTIFICATIONS,
          )
        ) {
          throw new SafeError(
            "Please select a target channel before enabling notifications",
          );
        }

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
            emailAccountId,
            messagingChannelEmailAccountId: emailAccountId,
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

async function resolveSlackRouteTarget({
  accessToken,
  providerUserId,
  targetId,
  logger,
}: {
  accessToken: string;
  providerUserId: string | null;
  targetId: string;
  logger: Logger;
}) {
  if (targetId === "dm") {
    logger.trace("Resolving Slack direct-message target", {
      hasProviderUserId: Boolean(providerUserId),
    });

    if (!providerUserId) {
      logger.error("Slack direct-message target is unavailable");
      throw new SafeError("Direct messages are not available for this channel");
    }

    return {
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId: providerUserId,
    };
  }

  const client = createSlackClient(accessToken);
  logger.trace("Resolving Slack channel target", { targetId });

  let channelInfo: Awaited<ReturnType<typeof getChannelInfo>> = null;
  try {
    channelInfo = await getChannelInfo(client, targetId);
  } catch (error) {
    logger.error("Failed to resolve Slack channel target", { error, targetId });
    throw error;
  }

  if (!channelInfo) {
    logger.error("Slack channel target not found", { targetId });
    throw new SafeError("Could not find the selected Slack channel");
  }

  if (!channelInfo.isPrivate) {
    logger.error("Slack channel target is not private", { targetId });
    throw new SafeError(
      "Only private channels are allowed. Please select a private channel.",
    );
  }

  if (!providerUserId) {
    logger.error("Slack channel target cannot be validated without user id", {
      targetId,
    });
    throw new SafeError(
      "Please reconnect Slack before selecting a private channel.",
    );
  }

  const availablePrivateChannels = await listPrivateChannelsForUser(
    client,
    providerUserId,
  );
  const isAvailableToUser = availablePrivateChannels.some(
    (channel) => channel.id === targetId,
  );

  if (!isAvailableToUser) {
    logger.error("Slack channel target is unavailable to user", {
      targetId,
    });
    throw new SafeError(
      "Only private channels you are a member of are allowed. Please select one of your private channels.",
    );
  }

  return {
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId,
  };
}

async function syncMessagingFeatureRoute({
  messagingChannelId,
  routes,
  purpose,
  enabled,
}: {
  messagingChannelId: string;
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetType: MessagingRouteTargetType;
    targetId: string;
  }>;
  purpose: MessagingFeatureRoutePurpose;
  enabled: boolean;
}) {
  if (!enabled) {
    await prisma.messagingRoute.deleteMany({
      where: {
        messagingChannelId,
        purpose,
      },
    });
    return;
  }

  const featureRoute = getMessagingRoute(routes, purpose);
  if (featureRoute) return;

  const rulesRoute = getMessagingRoute(
    routes,
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
  );

  if (!rulesRoute) {
    throw new SafeError(
      "Please select a target channel before enabling features",
    );
  }

  await prisma.messagingRoute.create({
    data: {
      messagingChannelId,
      purpose,
      targetType: rulesRoute.targetType,
      targetId: rulesRoute.targetId,
    },
  });
}
