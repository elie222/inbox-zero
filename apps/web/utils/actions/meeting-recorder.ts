"use server";

import { addHours } from "date-fns/addHours";
import { differenceInMinutes } from "date-fns/differenceInMinutes";
import { Prisma } from "@/generated/prisma/client";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import { actionClient } from "@/utils/actions/safe-action";
import {
  deleteMeetingNotesBody,
  setMeetingJoinOverrideBody,
  updateMeetingRecorderSettingsBody,
} from "@/utils/actions/meeting-recorder.validation";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import { SafeError } from "@/utils/error";
import {
  MAX_EVENTS_PER_PROVIDER,
  MEETING_LOOKAHEAD_HOURS,
  MEETING_RECORDER_MIN_TIER,
  RECONCILE_WINDOW_MINUTES,
} from "@/utils/meeting-recorder/config";
import { checkHasAccess } from "@/utils/premium/server";
import {
  reconcileSingleEvent,
  releaseAccountBookings,
  releaseAutomaticAccountBookings,
  releaseMeetingBooking,
  upsertMeeting,
} from "@/utils/meeting-recorder/reconcile";
import prisma from "@/utils/prisma";

export const deleteMeetingNotesAction = actionClient
  .metadata({ name: "deleteMeetingNotes" })
  .inputSchema(deleteMeetingNotesBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { meetingId } }) => {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        emailAccountId,
        recording: { emailAccountId },
      },
      select: { recordingId: true },
    });
    if (!meeting?.recordingId) throw new SafeError("Meeting not found");

    await prisma.$transaction([
      prisma.meeting.update({
        where: {
          id: meetingId,
          emailAccountId,
          recordingId: meeting.recordingId,
        },
        data: { recordingId: null, summary: Prisma.DbNull },
      }),
      prisma.meetingRecording.delete({
        where: { id: meeting.recordingId },
      }),
    ]);
  });

export const updateMeetingRecorderSettingsAction = actionClient
  .metadata({ name: "updateMeetingRecorderSettings" })
  .inputSchema(updateMeetingRecorderSettingsBody)
  .action(async ({ ctx: { emailAccountId, userId, logger }, parsedInput }) => {
    if (parsedInput.enabled === true) {
      const hasAccess = await checkHasAccess({
        userId,
        minimumTier: MEETING_RECORDER_MIN_TIER,
      });
      if (!hasAccess) {
        throw new SafeError("The notetaker is not included in your plan");
      }
    }

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: {
        meetingRecorderEnabled: parsedInput.enabled,
        meetingRecorderJoinRule: parsedInput.joinRule,
        meetingRecorderRecapEmailEnabled: parsedInput.recapEmailEnabled,
        meetingRecorderFollowUpDraftEnabled: parsedInput.followUpDraftEnabled,
      },
    });

    // Turning the notetaker off also drops this account from the cron's query,
    // so nothing else would ever cancel the bots it has already booked.
    if (parsedInput.enabled === false) {
      await releaseAccountBookings({ emailAccountId, logger });
    } else if (parsedInput.joinRule === MeetingJoinRule.OFF) {
      await releaseAutomaticAccountBookings({ emailAccountId, logger });
    }
  });

export const setMeetingJoinOverrideAction = actionClient
  .metadata({ name: "setMeetingJoinOverride" })
  .inputSchema(setMeetingJoinOverrideBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { join, calendarEventId },
    }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          id: true,
          email: true,
          name: true,
          userId: true,
          meetingRecorderEnabled: true,
          meetingRecorderJoinRule: true,
        },
      });
      if (!emailAccount) throw new SafeError("Email account not found");
      if (!emailAccount.meetingRecorderEnabled) {
        throw new SafeError("The notetaker is turned off for this account");
      }

      if (
        !join &&
        (await releaseMeetingBooking({
          emailAccountId,
          calendarEventId,
          logger,
        }))
      ) {
        return;
      }

      if (join) {
        // The cron filters on the paid tier before it books anything, and this
        // path books too, so it has to apply the same entitlement. Turning a
        // meeting off must remain available after a downgrade.
        const hasAccess = await checkHasAccess({
          userId: emailAccount.userId,
          minimumTier: MEETING_RECORDER_MIN_TIER,
        });
        if (!hasAccess) {
          throw new SafeError("The notetaker is not included in your plan");
        }
      }

      const timeMin = new Date();
      const { events } = await fetchCalendarEventsInWindow({
        emailAccountId,
        timeMin,
        timeMax: addHours(timeMin, MEETING_LOOKAHEAD_HOURS),
        maxResultsPerProvider: MAX_EVENTS_PER_PROVIDER,
        logger,
      });

      // Reading the event back from the user's own calendars is what keeps a
      // caller from attaching themselves to a meeting that is not theirs.
      const event = events.find(
        (candidate) => candidate.id === calendarEventId,
      );
      if (!event) throw new SafeError("Meeting not found on your calendar");
      if (!event.videoConferenceLink) {
        throw new SafeError("This meeting has no video link to join");
      }

      const meeting = await upsertMeeting({
        emailAccountId,
        event,
        joinOverride: join,
      });

      // New future bookings can wait for the cron. Removals and existing
      // bookings reconcile now so a moved event cannot strand the old bot
      // outside the cron window.
      const startsBeforeNextPass =
        differenceInMinutes(event.startTime, new Date()) <
        RECONCILE_WINDOW_MINUTES;

      if (!join || meeting.recordingId || startsBeforeNextPass) {
        await reconcileSingleEvent({ emailAccount, event, meeting, logger });
      }
    },
  );
