import type { Prisma } from "@prisma/client";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { runPipedreamAction, isPipedreamConnectConfigured } from "./connect";
import { formatMeetingBriefForChannel } from "./formatters";
import type {
  BriefingContent,
  InternalTeamMember,
} from "@inboxzero/resend/emails/meeting-briefing";

const logger = createScopedLogger("notification-channels");

export const CHANNEL_TYPES = {
  slack: {
    name: "Slack",
    defaultActionId: "slack_v2-send-message",
    configSchema: { channel: "string" }, // Channel ID like "C01234567"
  },
  teams: {
    name: "Microsoft Teams",
    defaultActionId: "microsoft_teams-send-message",
    configSchema: { teamId: "string", channelId: "string" },
  },
  telegram: {
    name: "Telegram",
    defaultActionId: "telegram_bot_api-send-message",
    configSchema: { chatId: "string" },
  },
  discord: {
    name: "Discord",
    defaultActionId: "discord-send-message",
    configSchema: { channelId: "string" },
  },
} as const;

export type ChannelType = keyof typeof CHANNEL_TYPES;

export type NotificationChannelConfig = {
  channelType: ChannelType;
  config: Record<string, unknown>;
  pipedreamActionId?: string;
};

export type MeetingBriefNotificationParams = {
  meetingTitle: string;
  formattedTime: string;
  briefingContent: BriefingContent;
  internalTeamMembers?: InternalTeamMember[];
  videoConferenceLink?: string;
  eventUrl?: string;
};

/**
 * Get notification channels for an email account
 * @param enabledOnly - If true, only returns enabled channels (for sending). If false, returns all channels (for settings UI).
 */
export async function getNotificationChannels(
  emailAccountId: string,
  enabledOnly = true,
): Promise<
  Array<{
    id: string;
    channelType: string;
    config: Record<string, unknown>;
    pipedreamActionId: string;
    enabled: boolean;
  }>
> {
  const channels = await prisma.notificationChannel.findMany({
    where: {
      emailAccountId,
      ...(enabledOnly ? { enabled: true } : {}),
    },
    select: {
      id: true,
      channelType: true,
      config: true,
      pipedreamActionId: true,
      enabled: true,
    },
  });

  return channels.map((c) => ({
    ...c,
    config: c.config as Record<string, unknown>,
  }));
}

/**
 * Check if Pipedream Connect is available for notifications
 */
export function isNotificationChannelsAvailable(): boolean {
  return isPipedreamConnectConfigured();
}

/**
 * Send a meeting brief to all enabled notification channels
 */
export async function sendMeetingBriefToChannels(
  emailAccountId: string,
  params: MeetingBriefNotificationParams,
): Promise<void> {
  const log = logger.with({ emailAccountId });

  if (!isPipedreamConnectConfigured()) {
    log.info(
      "Pipedream Connect not configured, skipping notification channels",
    );
    return;
  }

  const channels = await getNotificationChannels(emailAccountId);

  if (channels.length === 0) {
    log.info("No notification channels configured");
    return;
  }

  log.info("Sending meeting brief to notification channels", {
    channelCount: channels.length,
    channelTypes: channels.map((c) => c.channelType),
  });

  const supportedChannelTypes = Object.keys(CHANNEL_TYPES);

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const channelLog = log.with({
        channelType: channel.channelType,
        channelId: channel.id,
      });

      // Validate channel type before processing
      if (!supportedChannelTypes.includes(channel.channelType)) {
        channelLog.warn("Skipping unsupported channel type", {
          channelType: channel.channelType,
          supportedTypes: supportedChannelTypes,
        });
        return;
      }

      try {
        channelLog.info("Sending to notification channel");

        const formattedMessage = formatMeetingBriefForChannel(
          channel.channelType as ChannelType,
          params,
          channel.config,
        );

        await runPipedreamAction({
          actionId: channel.pipedreamActionId,
          externalUserId: emailAccountId,
          configuredProps: formattedMessage,
        });

        channelLog.info("Successfully sent to notification channel");
      } catch (error) {
        channelLog.error("Failed to send to notification channel", { error });
        throw error;
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  log.info("Meeting brief notification results", { succeeded, failed });
}

/**
 * Create or update a notification channel
 */
export async function upsertNotificationChannel(
  emailAccountId: string,
  params: NotificationChannelConfig & { enabled?: boolean },
): Promise<{ id: string }> {
  const channelTypeConfig = CHANNEL_TYPES[params.channelType];

  if (!channelTypeConfig) {
    throw new Error(`Unknown channel type: ${params.channelType}`);
  }

  const pipedreamActionId =
    params.pipedreamActionId ?? channelTypeConfig.defaultActionId;

  const channel = await prisma.notificationChannel.upsert({
    where: {
      emailAccountId_channelType: {
        emailAccountId,
        channelType: params.channelType,
      },
    },
    create: {
      emailAccountId,
      channelType: params.channelType,
      config: params.config as Prisma.InputJsonValue,
      pipedreamActionId,
      enabled: params.enabled ?? true,
    },
    update: {
      config: params.config as Prisma.InputJsonValue,
      pipedreamActionId,
      enabled: params.enabled,
    },
    select: { id: true },
  });

  return channel;
}

/**
 * Delete a notification channel
 */
export async function deleteNotificationChannel(
  emailAccountId: string,
  channelType: ChannelType,
): Promise<void> {
  await prisma.notificationChannel.delete({
    where: {
      emailAccountId_channelType: {
        emailAccountId,
        channelType,
      },
    },
  });
}

/**
 * Toggle a notification channel's enabled status
 */
export async function toggleNotificationChannel(
  emailAccountId: string,
  channelType: ChannelType,
  enabled: boolean,
): Promise<void> {
  await prisma.notificationChannel.update({
    where: {
      emailAccountId_channelType: {
        emailAccountId,
        channelType,
      },
    },
    data: { enabled },
  });
}
