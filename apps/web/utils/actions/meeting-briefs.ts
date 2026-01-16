"use server";

import { revalidatePath } from "next/cache";
import { actionClient } from "@/utils/actions/safe-action";
import {
  sendDebugBriefBody,
  updateMeetingBriefsEnabledBody,
  updateMeetingBriefsMinutesBeforeBody,
  upsertNotificationChannelBody,
  deleteNotificationChannelBody,
  toggleNotificationChannelBody,
} from "@/utils/actions/meeting-briefs.validation";
import {
  getNotificationChannels,
  upsertNotificationChannel,
  deleteNotificationChannel,
  toggleNotificationChannel,
  isNotificationChannelsAvailable,
  type ChannelType,
} from "@/utils/pipedream/notification-channels";
import prisma from "@/utils/prisma";
import { runMeetingBrief } from "@/utils/meeting-briefs/process";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";

export const updateMeetingBriefsEnabledAction = actionClient
  .metadata({ name: "updateMeetingBriefsEnabled" })
  .inputSchema(updateMeetingBriefsEnabledBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: {
        meetingBriefingsEnabled: enabled,
      },
    });
  });

export const updateMeetingBriefsMinutesBeforeAction = actionClient
  .metadata({ name: "updateMeetingBriefsMinutesBefore" })
  .inputSchema(updateMeetingBriefsMinutesBeforeBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { minutesBefore } }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          meetingBriefingsMinutesBefore: minutesBefore,
        },
      });
    },
  );

export const sendBriefAction = actionClient
  .metadata({ name: "sendBrief" })
  .inputSchema(sendDebugBriefBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { event } }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          id: true,
          userId: true,
          email: true,
          about: true,
          multiRuleSelectionEnabled: true,
          timezone: true,
          calendarBookingLink: true,
          user: {
            select: {
              aiProvider: true,
              aiModel: true,
              aiApiKey: true,
            },
          },
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      const calendarEvent: CalendarEvent = {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        eventUrl: event.eventUrl,
        videoConferenceLink: event.videoConferenceLink,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
        attendees: event.attendees,
      };

      return runMeetingBrief({
        event: calendarEvent,
        emailAccount,
        emailAccountId,
        isTestSend: true,
        logger,
      });
    },
  );

// Notification channel actions
export const getNotificationChannelsAction = actionClient
  .metadata({ name: "getNotificationChannels" })
  .action(async ({ ctx: { emailAccountId } }) => {
    // Fetch all channels (including disabled) for the settings UI
    const channels = await getNotificationChannels(emailAccountId, false);
    const isAvailable = isNotificationChannelsAvailable();
    return { channels, isAvailable };
  });

export const upsertNotificationChannelAction = actionClient
  .metadata({ name: "upsertNotificationChannel" })
  .inputSchema(upsertNotificationChannelBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { channelType, config, enabled, pipedreamActionId },
    }) => {
      if (!isNotificationChannelsAvailable()) {
        throw new SafeError(
          "Pipedream Connect is not configured. Please set up your Pipedream credentials.",
        );
      }

      const channel = await upsertNotificationChannel(emailAccountId, {
        channelType: channelType as ChannelType,
        config,
        enabled,
        pipedreamActionId,
      });

      revalidatePath(prefixPath(emailAccountId, "/briefs"));

      return channel;
    },
  );

export const deleteNotificationChannelAction = actionClient
  .metadata({ name: "deleteNotificationChannel" })
  .inputSchema(deleteNotificationChannelBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { channelType } }) => {
    await deleteNotificationChannel(emailAccountId, channelType as ChannelType);
    revalidatePath(prefixPath(emailAccountId, "/briefs"));
  });

export const toggleNotificationChannelAction = actionClient
  .metadata({ name: "toggleNotificationChannel" })
  .inputSchema(toggleNotificationChannelBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { channelType, enabled },
    }) => {
      await toggleNotificationChannel(
        emailAccountId,
        channelType as ChannelType,
        enabled,
      );
      revalidatePath(prefixPath(emailAccountId, "/briefs"));
    },
  );
