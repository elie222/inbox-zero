"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  sendDebugBriefBody,
  updateMeetingBriefsEnabledBody,
  updateMeetingBriefsMinutesBeforeBody,
} from "@/utils/actions/meeting-briefs.validation";
import prisma from "@/utils/prisma";
import { runMeetingBrief } from "@/utils/meeting-briefs/process";
import type { CalendarEvent } from "@/utils/calendar/event-types";

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
        isTestSend: true,
        logger,
      });
    },
  );
