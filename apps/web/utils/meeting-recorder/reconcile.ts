import { addMinutes } from "date-fns/addMinutes";
import { subMinutes } from "date-fns/subMinutes";
import { subHours } from "date-fns/subHours";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import {
  MeetingProcessingStatus,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";
import type { MeetingRecording } from "@/generated/prisma/client";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { toAttendeeSnapshot } from "@/utils/meeting-recorder/attendees";
import { MeetingBotProviderError } from "@/utils/meeting-recorder/bot-provider";
import {
  createMeetingBotProvider,
  DEFAULT_MEETING_BOT_PROVIDER,
} from "@/utils/meeting-recorder/create-bot-provider";
import { enqueueMeetingProcessing } from "@/utils/meeting-recorder/enqueue-processing";
import { shouldAutoJoin } from "@/utils/meeting-recorder/join-rule";
import {
  CHANGEABLE_STATUSES,
  LIVE_STATUSES,
  recordingStatusData,
} from "@/utils/meeting-recorder/recording-lifecycle";
import { isDuplicateError } from "@/utils/prisma-helpers";
import prisma from "@/utils/prisma";
import { normalizeMeetingUrl } from "@/utils/recall/normalize-meeting-url";

// The bot has to be booked before the call starts, so we look one cron interval
// further ahead than the lead time we want.
export const RECONCILE_WINDOW_MINUTES = 35;
const MAX_EVENTS_PER_PROVIDER = 50;
// Recurring instances are at least an hour apart, so a generous tolerance for
// matching "the same meeting" across accounts cannot collide across instances.
const SAME_MEETING_TOLERANCE_MINUTES = 30;
const STALE_CLAIM_MINUTES = 10;
const ABANDONED_RECORDING_HOURS = 24;
// Longer than the process route's maxDuration, so a slow run is never requeued
// while it is still going.
const STUCK_PROCESSING_MINUTES = 15;

export interface RecorderAccount {
  email: string;
  id: string;
  meetingRecorderJoinRule: MeetingJoinRule;
}

export async function reconcileAccount({
  emailAccount,
  logger,
}: {
  emailAccount: RecorderAccount;
  logger: Logger;
}): Promise<void> {
  const timeMin = new Date();
  const timeMax = addMinutes(timeMin, RECONCILE_WINDOW_MINUTES);

  const events = await fetchCalendarEventsInWindow({
    emailAccountId: emailAccount.id,
    timeMin,
    timeMax,
    maxResultsPerProvider: MAX_EVENTS_PER_PROVIDER,
    logger,
  });

  const videoEvents = events.filter((event) => event.videoConferenceLink);

  for (const event of videoEvents) {
    try {
      await reconcileSingleEvent({ emailAccount, event, logger });
    } catch (error) {
      logger.error("Failed to reconcile calendar event", {
        calendarEventId: event.id,
        error,
      });
      captureException(error, { emailAccountId: emailAccount.id });
    }
  }

  await releaseUnseenMeetings({
    emailAccount,
    seenEventIds: new Set(videoEvents.map((event) => event.id)),
    timeMin,
    timeMax,
    logger,
  });
}

/**
 * Brings a single calendar event in line with the account's settings: books,
 * moves or releases the bot as needed. Safe to call from the toggle action for
 * a meeting that starts before the next cron tick.
 */
export async function reconcileSingleEvent({
  emailAccount,
  event,
  logger,
}: {
  emailAccount: RecorderAccount;
  event: CalendarEvent;
  logger: Logger;
}): Promise<void> {
  if (!event.videoConferenceLink) return;

  const meeting = await upsertMeeting({
    emailAccountId: emailAccount.id,
    event,
  });
  const eventLogger = logger.with({ meetingId: meeting.id });

  const wantsRecording = shouldAutoJoin({
    event,
    rule: emailAccount.meetingRecorderJoinRule,
    userEmail: emailAccount.email,
    joinOverride: meeting.joinOverride,
  });

  if (!wantsRecording) {
    await releaseMeeting({ meetingId: meeting.id, logger: eventLogger });
    return;
  }

  if (meeting.recordingId) {
    await rescheduleIfMoved({
      meetingId: meeting.id,
      recordingId: meeting.recordingId,
      event,
      logger: eventLogger,
    });
    return;
  }

  const recording = await findOrCreateRecording({ event, logger: eventLogger });
  if (!recording) return;

  await linkMeetingToRecording({
    meetingId: meeting.id,
    recordingId: recording.id,
    logger: eventLogger,
  });
}

/**
 * Records the account's copy of a calendar event, refreshing the snapshot we
 * fall back on once the event itself is gone. Shared with the join-override
 * action so both paths always write the same fields.
 */
export async function upsertMeeting({
  emailAccountId,
  event,
  joinOverride,
}: {
  emailAccountId: string;
  event: CalendarEvent;
  joinOverride?: boolean;
}) {
  const snapshot = {
    eventTitle: event.title,
    startTime: event.startTime,
    endTime: event.endTime,
    attendees: toAttendeeSnapshot(event.attendees),
    organizerEmail: event.organizerEmail ?? null,
    ...(joinOverride === undefined ? {} : { joinOverride }),
  };

  return prisma.meeting.upsert({
    where: {
      emailAccountId_calendarEventId: {
        emailAccountId,
        calendarEventId: event.id,
      },
    },
    create: { ...snapshot, emailAccountId, calendarEventId: event.id },
    update: snapshot,
  });
}

async function findOrCreateRecording({
  event,
  logger,
}: {
  event: CalendarEvent;
  logger: Logger;
}): Promise<MeetingRecording | null> {
  const meetingUrl = event.videoConferenceLink;
  if (!meetingUrl) return null;

  const normalizedMeetingUrl = normalizeMeetingUrl(meetingUrl);

  const existing = await findLiveRecording({
    normalizedMeetingUrl,
    startTime: event.startTime,
  });
  if (existing) {
    // A claim whose provider call failed transiently is still sitting here with
    // no bot behind it. Booking it now is the retry.
    if (existing.externalBotId) return existing;
    return bookBot({ recording: existing, logger });
  }

  // Claim the meeting by writing the row before calling the provider. If we
  // crash between the two, the stale-claim sweep cleans up; the reverse order
  // would leak a bot we have no record of.
  let claimed: MeetingRecording;
  try {
    claimed = await prisma.meetingRecording.create({
      data: {
        botProvider: DEFAULT_MEETING_BOT_PROVIDER,
        meetingUrl,
        normalizedMeetingUrl,
        activeKey: normalizedMeetingUrl,
        meetingStartTime: event.startTime,
      },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
    // Another account booked the same meeting between our lookup and our write.
    return findLiveRecording({
      normalizedMeetingUrl,
      startTime: event.startTime,
    });
  }

  return bookBot({ recording: claimed, logger });
}

async function bookBot({
  recording,
  logger,
}: {
  recording: MeetingRecording;
  logger: Logger;
}): Promise<MeetingRecording | null> {
  const provider = createMeetingBotProvider(recording.botProvider, logger);

  let externalBotId: string;
  try {
    ({ externalBotId } = await provider.scheduleBot({
      meetingUrl: recording.meetingUrl,
      joinAt: recording.meetingStartTime,
    }));
  } catch (error) {
    logger.error("Failed to schedule meeting bot", {
      recordingId: recording.id,
      error,
    });

    if (error instanceof MeetingBotProviderError && error.permanent) {
      // The provider will never accept this meeting, so drop the claim rather
      // than blocking the slot for the rest of the day.
      await prisma.meetingRecording.delete({ where: { id: recording.id } });
    }

    captureException(error);
    return null;
  }

  // Guarded on externalBotId so two passes racing to retry the same claim
  // cannot both take credit; the loser cancels the bot it just created.
  const claimed = await prisma.meetingRecording.updateMany({
    where: { id: recording.id, externalBotId: null },
    data: { externalBotId, status: MeetingRecordingStatus.SCHEDULED },
  });

  if (claimed.count === 0) {
    logger.info("Another pass already booked this meeting", {
      recordingId: recording.id,
    });
    await provider.cancelBot(externalBotId);
  }

  return prisma.meetingRecording.findUnique({ where: { id: recording.id } });
}

function findLiveRecording({
  normalizedMeetingUrl,
  startTime,
}: {
  normalizedMeetingUrl: string;
  startTime: Date;
}) {
  return prisma.meetingRecording.findFirst({
    where: {
      normalizedMeetingUrl,
      meetingStartTime: {
        gte: subMinutes(startTime, SAME_MEETING_TOLERANCE_MINUTES),
        lte: addMinutes(startTime, SAME_MEETING_TOLERANCE_MINUTES),
      },
      status: { in: LIVE_STATUSES },
    },
    orderBy: { meetingStartTime: "asc" },
  });
}

async function linkMeetingToRecording({
  meetingId,
  recordingId,
  logger,
}: {
  meetingId: string;
  recordingId: string;
  logger: Logger;
}): Promise<void> {
  try {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { recordingId },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;

    // The account holds this meeting on two calendars. Only one Meeting row may
    // own the recording, so the duplicate is closed out without a summary.
    logger.info("Meeting already recorded under another calendar event", {
      recordingId,
    });
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { processingStatus: MeetingProcessingStatus.COMPLETED },
    });
  }
}

async function rescheduleIfMoved({
  meetingId,
  recordingId,
  event,
  logger,
}: {
  meetingId: string;
  recordingId: string;
  event: CalendarEvent;
  logger: Logger;
}): Promise<void> {
  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording) return;

  const startTimeUnchanged =
    recording.meetingStartTime.getTime() === event.startTime.getTime();
  if (startTimeUnchanged) return;

  // Once the bot is joining or in the call there is nothing left to move.
  if (!CHANGEABLE_STATUSES.includes(recording.status)) return;
  if (!recording.externalBotId) return;

  const provider = createMeetingBotProvider(recording.botProvider, logger);
  await provider.rescheduleBot(recording.externalBotId, {
    joinAt: event.startTime,
  });

  try {
    await prisma.meetingRecording.update({
      where: { id: recording.id },
      data: { meetingStartTime: event.startTime },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;

    // The event was moved onto a slot another recording already holds. Fold
    // this meeting into that recording instead of retrying into the same clash.
    await mergeIntoExistingRecording({ meetingId, recording, event, logger });
  }
}

async function mergeIntoExistingRecording({
  meetingId,
  recording,
  event,
  logger,
}: {
  meetingId: string;
  recording: MeetingRecording;
  event: CalendarEvent;
  logger: Logger;
}): Promise<void> {
  const target = await findLiveRecording({
    normalizedMeetingUrl: recording.normalizedMeetingUrl,
    startTime: event.startTime,
  });

  if (!target || target.id === recording.id) {
    logger.warn("Could not merge rescheduled recording", {
      recordingId: recording.id,
    });
    return;
  }

  // Detach before releasing, so the old recording looks unwanted to the
  // "nobody is linked" check that guards the cancel.
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { recordingId: null },
  });
  await releaseRecording({ recording, logger });
  await linkMeetingToRecording({ meetingId, recordingId: target.id, logger });
}

/** Detaches a meeting from its recording, cancelling the bot if nobody else wants it. */
async function releaseMeeting({
  meetingId,
  logger,
}: {
  meetingId: string;
  logger: Logger;
}): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { recordingId: true },
  });
  if (!meeting?.recordingId) return;

  const recordingId = meeting.recordingId;
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { recordingId: null },
  });

  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording) return;

  await releaseRecording({ recording, logger });
}

/**
 * Cancels a recording nobody wants any more. The "nobody" test is part of the
 * write itself, so an account linking to this recording at the same moment
 * cannot have its bot cancelled out from under it.
 */
async function releaseRecording({
  recording,
  logger,
}: {
  recording: MeetingRecording;
  logger: Logger;
}): Promise<void> {
  const cancelled = await prisma.meetingRecording.updateMany({
    where: {
      id: recording.id,
      status: { in: CHANGEABLE_STATUSES },
      meetings: { none: {} },
    },
    data: recordingStatusData(MeetingRecordingStatus.CANCELLED),
  });
  if (cancelled.count === 0) return;

  if (recording.externalBotId) {
    const provider = createMeetingBotProvider(recording.botProvider, logger);
    await provider.cancelBot(recording.externalBotId);
  }

  logger.info("Cancelled meeting recording", { recordingId: recording.id });
}

// Events deleted from the calendar simply stop appearing in the fetch, so the
// only way to notice them is to look for meetings we booked but did not see.
async function releaseUnseenMeetings({
  emailAccount,
  seenEventIds,
  timeMin,
  timeMax,
  logger,
}: {
  emailAccount: RecorderAccount;
  seenEventIds: Set<string>;
  timeMin: Date;
  timeMax: Date;
  logger: Logger;
}): Promise<void> {
  const booked = await prisma.meeting.findMany({
    where: {
      emailAccountId: emailAccount.id,
      recordingId: { not: null },
      startTime: { gte: timeMin, lte: timeMax },
      recording: { status: { in: CHANGEABLE_STATUSES } },
    },
    select: { id: true, calendarEventId: true },
  });

  for (const meeting of booked) {
    if (seenEventIds.has(meeting.calendarEventId)) continue;

    try {
      await releaseMeeting({ meetingId: meeting.id, logger });
    } catch (error) {
      logger.error("Failed to release meeting for a vanished event", {
        meetingId: meeting.id,
        error,
      });
      captureException(error, { emailAccountId: emailAccount.id });
    }
  }
}

/**
 * Account-independent cleanup, run once per cron tick: drops claims we never
 * managed to book, fails recordings that never reported an outcome, and retries
 * media deletion we owe the user.
 */
export async function sweepRecordings({
  logger,
}: {
  logger: Logger;
}): Promise<void> {
  const now = new Date();

  const staleClaims = await prisma.meetingRecording.deleteMany({
    where: {
      status: MeetingRecordingStatus.PENDING,
      externalBotId: null,
      createdAt: { lt: subMinutes(now, STALE_CLAIM_MINUTES) },
    },
  });
  if (staleClaims.count > 0) {
    logger.info("Deleted stale meeting recording claims", {
      count: staleClaims.count,
    });
  }

  const abandoned = await prisma.meetingRecording.updateMany({
    where: {
      status: { in: LIVE_STATUSES },
      meetingStartTime: { lt: subHours(now, ABANDONED_RECORDING_HOURS) },
    },
    data: {
      ...recordingStatusData(MeetingRecordingStatus.FAILED),
      failureReason: "The notetaker never reported back for this meeting.",
    },
  });
  if (abandoned.count > 0) {
    logger.info("Failed abandoned meeting recordings", {
      count: abandoned.count,
    });
  }

  await requeueStuckMeetings({ logger });
  await retryPendingMediaDeletion({ logger });
}

// A run killed mid-flight leaves the Meeting claimed. Once the queue has given
// up retrying, this is the only thing that gets it moving again.
async function requeueStuckMeetings({
  logger,
}: {
  logger: Logger;
}): Promise<void> {
  const stuck = await prisma.meeting.findMany({
    where: {
      processingStatus: MeetingProcessingStatus.PROCESSING,
      updatedAt: { lt: subMinutes(new Date(), STUCK_PROCESSING_MINUTES) },
    },
    select: { id: true },
    take: 50,
  });

  for (const meeting of stuck) {
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { processingStatus: MeetingProcessingStatus.PENDING },
    });
    await enqueueMeetingProcessing({ meetingId: meeting.id, logger });
  }

  if (stuck.length > 0) {
    logger.info("Requeued stuck meeting processing", { count: stuck.length });
  }
}

async function retryPendingMediaDeletion({
  logger,
}: {
  logger: Logger;
}): Promise<void> {
  const recordings = await prisma.meetingRecording.findMany({
    where: {
      status: MeetingRecordingStatus.DONE,
      // The bot reports `done` when it leaves the call, which is well before the
      // transcript is ready. Deleting the media before we have the transcript
      // would destroy the recording for good.
      transcriptFetchedAt: { not: null },
      mediaDeletedAt: null,
      externalBotId: { not: null },
    },
    take: 50,
  });

  for (const recording of recordings) {
    if (!recording.externalBotId) continue;

    try {
      const provider = createMeetingBotProvider(recording.botProvider, logger);
      await provider.deleteMedia(recording.externalBotId);
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { mediaDeletedAt: new Date() },
      });
    } catch (error) {
      logger.error("Failed to delete meeting recording media", {
        recordingId: recording.id,
        error,
      });
      captureException(error);
    }
  }
}
