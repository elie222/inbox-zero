import { subDays } from "date-fns/subDays";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { formatInUserTimezone } from "@/utils/date";
import { parseAttendeeSnapshot } from "@/utils/meeting-recorder/attendees";
import {
  parseMeetingSummary,
  type MeetingSummary,
} from "@/utils/ai/meeting-recorder/summarize-meeting";

const RECORDED_MEETING_LOOKBACK_DAYS = 30;
const MAX_RECORDED_MEETINGS = 3;
// Fetched before the attendee filter runs in JS, so this bounds the scan, not
// the result size.
const FETCH_LIMIT = 25;

export interface RecordedMeetingContext {
  eventTitle: string;
  startTime: Date;
  summary: MeetingSummary;
}

/**
 * Fetches AI summaries of recorded meetings (from the meeting notetaker) that
 * the email's recipients attended, for use as drafting context.
 *
 * Privacy: recorded content is stricter than calendar metadata. A meeting is
 * only included when every recipient of the email was a non-declined attendee,
 * so what was said in a call is never surfaced to someone who wasn't on it.
 */
export async function getRecordedMeetingContext({
  emailAccountId,
  recipientEmail,
  additionalRecipients = [],
  logger,
}: {
  emailAccountId: string;
  recipientEmail: string;
  additionalRecipients?: string[];
  logger: Logger;
}): Promise<RecordedMeetingContext[]> {
  try {
    const meetings = await prisma.meeting.findMany({
      where: {
        emailAccountId,
        summary: { not: Prisma.DbNull },
        startTime: { gte: subDays(new Date(), RECORDED_MEETING_LOOKBACK_DAYS) },
      },
      orderBy: { startTime: "desc" },
      take: FETCH_LIMIT,
      select: {
        eventTitle: true,
        startTime: true,
        attendees: true,
        summary: true,
      },
    });

    const requiredAttendees = [recipientEmail, ...additionalRecipients].map(
      (email) => email.trim().toLowerCase(),
    );

    const results: RecordedMeetingContext[] = [];

    for (const meeting of meetings) {
      if (results.length >= MAX_RECORDED_MEETINGS) break;

      const attendedEmails = new Set(
        parseAttendeeSnapshot(meeting.attendees)
          .filter((attendee) => !attendee.declined)
          .map((attendee) => attendee.email.trim().toLowerCase()),
      );
      if (!requiredAttendees.every((email) => attendedEmails.has(email))) {
        continue;
      }

      const summary = parseMeetingSummary(meeting.summary);
      if (!summary) continue;

      results.push({
        eventTitle: meeting.eventTitle,
        startTime: meeting.startTime,
        summary,
      });
    }

    return results;
  } catch (error) {
    logger.error("Failed to get recorded meeting context", { error });
    return [];
  }
}

/**
 * Formats recorded meeting summaries for inclusion in the reply-drafting
 * prompt.
 */
export function formatRecordedMeetingContextForPrompt(
  meetings: RecordedMeetingContext[],
  timezone?: string | null,
): string | null {
  if (meetings.length === 0) return null;

  const notes = meetings
    .map((meeting) => formatRecordedMeeting(meeting, timezone))
    .join("\n\n");

  return `You have notes from recorded meetings that the recipients of this email attended:

<recorded_meeting_notes>
${notes}
</recorded_meeting_notes>

Treat these notes as factual context about what was discussed and agreed. Reference the conversation naturally when relevant (e.g. "as discussed on our call"). Do not mention recordings, transcripts, or notes, and do not recap the meeting unprompted.`;
}

function formatRecordedMeeting(
  meeting: RecordedMeetingContext,
  timezone?: string | null,
): string {
  const dateTime = formatInUserTimezone(
    meeting.startTime,
    timezone,
    "EEEE, MMMM d 'at' h:mm a",
  );
  const { summary } = meeting;

  const lines = [
    `- "${meeting.eventTitle}" on ${dateTime}`,
    `  Overview: ${summary.overview}`,
  ];

  if (summary.keyDecisions.length > 0) {
    lines.push(`  Decisions: ${summary.keyDecisions.join("; ")}`);
  }
  if (summary.actionItems.length > 0) {
    const items = summary.actionItems
      .map((item) =>
        item.owner
          ? `${item.description} (owner: ${item.owner})`
          : item.description,
      )
      .join("; ");
    lines.push(`  Action items: ${items}`);
  }
  if (summary.openQuestions?.length) {
    lines.push(`  Open questions: ${summary.openQuestions.join("; ")}`);
  }
  if (summary.nextSteps?.length) {
    lines.push(`  Next steps: ${summary.nextSteps.join("; ")}`);
  }

  return lines.join("\n");
}
