import { addHours } from "date-fns/addHours";
import { NextResponse } from "next/server";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import type { Logger } from "@/utils/logger";
import { shouldAutoJoin } from "@/utils/meeting-recorder/join-rule";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const LOOKAHEAD_HOURS = 48;
const MAX_EVENTS_PER_PROVIDER = 50;

export type GetMeetingRecorderUpcomingResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/meeting-recorder/upcoming",
  async (request) => {
    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { email: true, meetingRecorderJoinRule: true },
  });

  const timeMin = new Date();
  const timeMax = addHours(timeMin, LOOKAHEAD_HOURS);

  const events = await fetchCalendarEventsInWindow({
    emailAccountId,
    timeMin,
    timeMax,
    maxResultsPerProvider: MAX_EVENTS_PER_PROVIDER,
    logger,
  });

  const videoEvents = events.filter((event) => event.videoConferenceLink);

  const meetings = await prisma.meeting.findMany({
    where: {
      emailAccountId,
      calendarEventId: { in: videoEvents.map((event) => event.id) },
    },
    select: {
      id: true,
      calendarEventId: true,
      joinOverride: true,
      recordingId: true,
      recording: { select: { status: true, failureReason: true } },
    },
  });

  const meetingsByEventId = new Map(
    meetings.map((meeting) => [meeting.calendarEventId, meeting]),
  );

  const rule =
    emailAccount?.meetingRecorderJoinRule ?? MeetingJoinRule.EXTERNAL_ONLY;

  return {
    joinRule: rule,
    events: videoEvents.map((event) => {
      const meeting = meetingsByEventId.get(event.id);

      return {
        id: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        videoConferenceLink: event.videoConferenceLink,
        organizerEmail: event.organizerEmail,
        isOrganizer: event.isOrganizer,
        attendees: event.attendees,
        // Decided server-side with the same helper the cron uses, so the toggle
        // can never disagree with what actually happens.
        willRecord: shouldAutoJoin({
          event,
          rule,
          userEmail: emailAccount?.email ?? "",
          joinOverride: meeting?.joinOverride,
        }),
        source: getSource(meeting),
        meetingId: meeting?.id,
        recordingStatus: meeting?.recording?.status,
        failureReason: meeting?.recording?.failureReason,
      };
    }),
  };
}

function getSource(
  meeting:
    | { joinOverride: boolean | null; recordingId: string | null }
    | undefined,
) {
  if (meeting?.recordingId) return "scheduled" as const;
  if (meeting?.joinOverride != null) return "override" as const;
  return "rule" as const;
}
