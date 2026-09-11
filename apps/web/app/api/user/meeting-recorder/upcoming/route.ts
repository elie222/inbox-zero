import { addHours } from "date-fns/addHours";
import { NextResponse } from "next/server";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import type { Logger } from "@/utils/logger";
import {
  MAX_EVENTS_PER_PROVIDER,
  MEETING_LOOKAHEAD_HOURS,
  MEETING_RECORDER_MIN_TIER,
} from "@/utils/meeting-recorder/config";
import { shouldAutoJoin } from "@/utils/meeting-recorder/join-rule";
import {
  ACTIVE_CALL_STATUSES,
  CANCELLABLE_STATUSES,
} from "@/utils/meeting-recorder/recording-lifecycle";
import { withEmailAccount } from "@/utils/middleware";
import { checkHasAccess } from "@/utils/premium/server";
import prisma from "@/utils/prisma";

export type GetMeetingRecorderUpcomingResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/meeting-recorder/upcoming",
  async (request) => {
    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
      userId: request.auth.userId,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  userId,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  logger: Logger;
}) {
  const timeMin = new Date();
  const timeMax = addHours(timeMin, MEETING_LOOKAHEAD_HOURS);

  const [hasAccess, emailAccount, { events }] = await Promise.all([
    checkHasAccess({ userId, minimumTier: MEETING_RECORDER_MIN_TIER }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { email: true, meetingRecorderJoinRule: true },
    }),
    fetchCalendarEventsInWindow({
      emailAccountId,
      timeMin,
      timeMax,
      maxResultsPerProvider: MAX_EVENTS_PER_PROVIDER,
      logger,
    }),
  ]);

  const videoEvents = events.filter((event) => event.videoConferenceLink);
  const videoEventIds = new Set(videoEvents.map((event) => event.id));

  const meetings = await prisma.meeting.findMany({
    where: {
      emailAccountId,
      OR: [
        { calendarEventId: { in: [...videoEventIds] } },
        { recording: { status: { in: ACTIVE_CALL_STATUSES } } },
      ],
    },
    select: {
      id: true,
      calendarEventId: true,
      eventTitle: true,
      startTime: true,
      endTime: true,
      joinOverride: true,
      recording: { select: { status: true, failureReason: true } },
    },
  });

  const meetingsByEventId = new Map(
    meetings.map((meeting) => [meeting.calendarEventId, meeting]),
  );

  const activeCallsMissingFromCalendar = meetings.flatMap((meeting) => {
    const recording = meeting.recording;
    if (
      !recording ||
      !ACTIVE_CALL_STATUSES.includes(recording.status) ||
      videoEventIds.has(meeting.calendarEventId)
    ) {
      return [];
    }

    return [
      {
        id: meeting.calendarEventId,
        meetingId: meeting.id,
        title: meeting.eventTitle,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        hasCancellableBooking: true,
        joinOverride: meeting.joinOverride,
        willRecord: false,
        recordingStatus: recording.status,
        failureReason: recording.failureReason,
      },
    ];
  });

  const rule = emailAccount?.meetingRecorderJoinRule ?? MeetingJoinRule.ALL;
  const upcomingEvents = videoEvents.map((event) => {
    const meeting = meetingsByEventId.get(event.id);

    return {
      id: event.id,
      meetingId: meeting?.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      hasCancellableBooking:
        !!meeting?.recording &&
        CANCELLABLE_STATUSES.includes(meeting.recording.status),
      joinOverride: meeting?.joinOverride ?? null,
      // Decided server-side with the same helper the cron uses, so the toggle
      // can never disagree with what actually happens.
      willRecord:
        hasAccess &&
        shouldAutoJoin({
          event,
          rule,
          userEmail: emailAccount?.email ?? "",
          joinOverride: meeting?.joinOverride,
        }),
      recordingStatus: meeting?.recording?.status,
      failureReason: meeting?.recording?.failureReason,
    };
  });

  return {
    hasAccess,
    events: [...activeCallsMissingFromCalendar, ...upcomingEvents],
  };
}
