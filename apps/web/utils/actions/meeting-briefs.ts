"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  sendDebugBriefBody,
  updateMeetingBriefsSettingsBody,
} from "@/utils/actions/meeting-briefs.validation";
import prisma from "@/utils/prisma";
import { runMeetingBrief } from "@/utils/meeting-briefs/process";
import { createScopedLogger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";

const debugLogger = createScopedLogger("meeting-briefs/debug");

export const updateMeetingBriefsSettingsAction = actionClient
  .metadata({ name: "updateMeetingBriefsSettings" })
  .inputSchema(updateMeetingBriefsSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { enabled, minutesBefore },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          meetingBriefingsEnabled: enabled,
          meetingBriefingsMinutesBefore: minutesBefore,
        },
      });
    },
  );

export const sendBriefAction = actionClient
  .metadata({ name: "sendBrief" })
  .inputSchema(sendDebugBriefBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { event } }) => {
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
      throw new Error("Email account not found");
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
      logger: debugLogger,
    });
  });
