import { addMinutes } from "date-fns/addMinutes";
import { subMinutes } from "date-fns/subMinutes";
import { subHours } from "date-fns/subHours";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import {
  MeetingProcessingStatus,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";
import { Prisma, type MeetingRecording } from "@/generated/prisma/client";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { toAttendeeSnapshot } from "@/utils/meeting-recorder/attendees";
import { MeetingBotProviderError } from "@/utils/meeting-recorder/bot-provider";
import {
  MAX_EVENTS_PER_PROVIDER,
  RECONCILE_WINDOW_MINUTES,
  STUCK_PROCESSING_MINUTES,
  STUCK_TRANSCRIPT_REQUEST_MINUTES,
} from "@/utils/meeting-recorder/config";
import {
  createMeetingBotProvider,
  DEFAULT_MEETING_BOT_PROVIDER,
} from "@/utils/meeting-recorder/create-bot-provider";
import { deleteRecordingMedia } from "@/utils/meeting-recorder/delete-media";
import {
  enqueueMeetingProcessing,
  enqueueTranscriptFetch,
} from "@/utils/meeting-recorder/enqueue-processing";
import { shouldAutoJoin } from "@/utils/meeting-recorder/join-rule";
import {
  CHANGEABLE_STATUSES,
  LIVE_STATUSES,
  recordingStatusData,
} from "@/utils/meeting-recorder/recording-lifecycle";
import { isDuplicateError } from "@/utils/prisma-helpers";
import prisma from "@/utils/prisma";
import { normalizeMeetingUrl } from "@/utils/recall/normalize-meeting-url";

// Recurring instances are at least an hour apart, so a generous tolerance for
// matching "the same meeting" across accounts cannot collide across instances.
const SAME_MEETING_TOLERANCE_MINUTES = 30;
const STALE_CLAIM_MINUTES = 10;
const ABANDONED_RECORDING_HOURS = 24;

interface RecorderAccount {
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

  const { events, complete } = await fetchCalendarEventsInWindow({
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

  // Releasing infers "deleted" from "absent", which is only sound when we know
  // we saw the whole calendar. A provider outage would otherwise cancel every
  // bot this account has booked.
  if (!complete) {
    logger.warn("Skipping release sweep after an incomplete calendar fetch");
    return;
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
    await releaseMeeting({
      meetingId: meeting.id,
      recordingId: meeting.recordingId,
      logger: eventLogger,
    });
    return;
  }

  if (meeting.recordingId) {
    const stillBooked = await updateBookingForEvent({
      meetingId: meeting.id,
      recordingId: meeting.recordingId,
      event,
      logger: eventLogger,
    });
    // A released booking falls through to book again against the new link.
    if (stillBooked) return;
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

  return recording;
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

/**
 * Brings an existing booking in line with the event.
 *
 * Returns false when the booking was released because the join link changed,
 * which tells the caller to book again from scratch: a new link (or even just a
 * new Zoom password) means the existing bot would join the wrong meeting, or
 * fail to join at all.
 */
async function updateBookingForEvent({
  meetingId,
  recordingId,
  event,
  logger,
}: {
  meetingId: string;
  recordingId: string;
  event: CalendarEvent;
  logger: Logger;
}): Promise<boolean> {
  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording) return false;

  if (recording.meetingUrl !== event.videoConferenceLink) {
    logger.info("Meeting link changed, rebooking", { recordingId });
    await releaseMeeting({ meetingId, recordingId, logger });
    return false;
  }

  const startTimeUnchanged =
    recording.meetingStartTime.getTime() === event.startTime.getTime();
  if (startTimeUnchanged) return true;

  // Once the bot is joining or in the call there is nothing left to move.
  if (!CHANGEABLE_STATUSES.includes(recording.status)) return true;
  if (!recording.externalBotId) return true;

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

  return true;
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

/**
 * Releases every booking an account still holds. Turning the notetaker off also
 * removes the account from the cron's query, so without this its already-booked
 * bots would still turn up to the calls.
 */
export async function releaseAccountBookings({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<void> {
  const booked = await prisma.meeting.findMany({
    where: {
      emailAccountId,
      recordingId: { not: null },
      recording: { status: { in: CHANGEABLE_STATUSES } },
    },
    select: { id: true, recordingId: true },
  });

  for (const meeting of booked) {
    try {
      await releaseMeeting({
        meetingId: meeting.id,
        recordingId: meeting.recordingId,
        logger,
      });
    } catch (error) {
      logger.error("Failed to release booking", {
        meetingId: meeting.id,
        error,
      });
      captureException(error, { emailAccountId });
    }
  }

  if (booked.length > 0) {
    logger.info("Released bookings for the account", { count: booked.length });
  }
}

/** Detaches a meeting from its recording, cancelling the bot if nobody else wants it. */
async function releaseMeeting({
  meetingId,
  recordingId,
  logger,
}: {
  meetingId: string;
  recordingId: string | null;
  logger: Logger;
}): Promise<void> {
  if (!recordingId) return;

  // Only detach the recording we were asked about. `recordingId` is a snapshot,
  // so a concurrent pass may already have linked a different one, and clearing
  // unconditionally would drop that new booking on the floor.
  const detached = await prisma.meeting.updateMany({
    where: { id: meetingId, recordingId },
    data: { recordingId: null },
  });
  if (detached.count === 0) return;

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
    select: { id: true, calendarEventId: true, recordingId: true },
  });

  for (const meeting of booked) {
    if (seenEventIds.has(meeting.calendarEventId)) continue;

    try {
      await releaseMeeting({
        meetingId: meeting.id,
        recordingId: meeting.recordingId,
        logger,
      });
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

  await failAbandonedRecordings({ now, logger });
  await retryStuckTranscriptRequests({ now, logger });
  await requeueStuckTranscripts({ now, logger });
  await requeueStuckMeetings({ logger });
  await retryPendingMediaDeletion({ logger });
}

/**
 * Fails recordings that never reported an outcome. The bot is cancelled first:
 * marking the row terminal releases its dedup slot, so leaving a live bot
 * behind would let a replacement be booked for a call it is already in.
 */
async function failAbandonedRecordings({
  now,
  logger,
}: {
  now: Date;
  logger: Logger;
}): Promise<void> {
  const abandoned = await prisma.meetingRecording.findMany({
    where: {
      status: { in: LIVE_STATUSES },
      meetingStartTime: { lt: subHours(now, ABANDONED_RECORDING_HOURS) },
    },
    take: 50,
  });

  for (const recording of abandoned) {
    if (recording.externalBotId) {
      try {
        const provider = createMeetingBotProvider(
          recording.botProvider,
          logger,
        );
        await provider.cancelBot(recording.externalBotId);
      } catch (error) {
        // Leave the row live so the next sweep tries the cancel again.
        logger.error("Failed to cancel an abandoned bot", {
          recordingId: recording.id,
          error,
        });
        captureException(error);
        continue;
      }
    }

    await prisma.meetingRecording.update({
      where: { id: recording.id },
      data: {
        ...recordingStatusData(MeetingRecordingStatus.FAILED),
        failureReason: "The notetaker never reported back for this meeting.",
      },
    });
  }

  if (abandoned.length > 0) {
    logger.info("Swept abandoned meeting recordings", {
      count: abandoned.length,
    });
  }
}

/**
 * Re-requests transcription for recordings whose create-transcript call was
 * claimed but never produced a transcript, because the worker died or the
 * provider never accepted the request.
 *
 * The claim is deliberately not released on failure, so this sweep is the only
 * thing that recovers such a recording. It waits a long time before retrying,
 * since a request that actually landed and is merely slow would otherwise be
 * paid for twice.
 */
async function retryStuckTranscriptRequests({
  now,
  logger,
}: {
  now: Date;
  logger: Logger;
}): Promise<void> {
  const stuck = await prisma.meetingRecording.findMany({
    where: {
      externalRecordingId: { not: null },
      externalTranscriptId: null,
      status: { in: LIVE_STATUSES },
      transcriptRequestedAt: {
        lt: subMinutes(now, STUCK_TRANSCRIPT_REQUEST_MINUTES),
      },
    },
    take: 50,
  });

  for (const recording of stuck) {
    if (!recording.externalRecordingId) continue;

    try {
      const provider = createMeetingBotProvider(recording.botProvider, logger);
      await provider.createTranscript(recording.externalRecordingId);
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { transcriptRequestedAt: now },
      });
    } catch (error) {
      logger.error("Failed to re-request transcription", {
        recordingId: recording.id,
        error,
      });
      captureException(error);
    }
  }

  if (stuck.length > 0) {
    logger.info("Re-requested stuck transcriptions", { count: stuck.length });
  }
}

/**
 * Re-queues transcripts whose fetch never completed. The webhook has already
 * acknowledged the provider by this point, so nothing else would retry them.
 */
async function requeueStuckTranscripts({
  now,
  logger,
}: {
  now: Date;
  logger: Logger;
}): Promise<void> {
  const stuck = await prisma.meetingRecording.findMany({
    where: {
      externalTranscriptId: { not: null },
      transcript: { equals: Prisma.DbNull },
      OR: [
        { transcriptFetchedAt: null },
        {
          transcriptFetchedAt: {
            lt: subMinutes(now, STUCK_PROCESSING_MINUTES),
          },
        },
      ],
    },
    select: { id: true },
    take: 50,
  });

  for (const recording of stuck) {
    // Release the claim so the queued job can take it again.
    await prisma.meetingRecording.update({
      where: { id: recording.id },
      data: { transcriptFetchedAt: null },
    });
    await enqueueTranscriptFetch({ recordingId: recording.id, logger });
  }

  if (stuck.length > 0) {
    logger.info("Requeued stuck transcript fetches", { count: stuck.length });
  }
}

/**
 * Re-queues meetings whose summary never ran: a run killed mid-flight, or a
 * hand-off whose enqueue never landed.
 *
 * It deliberately does not move the status first. Writing PENDING and then
 * enqueueing would strand the row if the enqueue failed, because the next pass
 * would no longer recognise it. Instead the row is left alone and the job is
 * re-sent; `processMeetingForAccount` claims it, and re-sending a job for a
 * meeting already in flight is harmless because that claim is what decides.
 */
async function requeueStuckMeetings({
  logger,
}: {
  logger: Logger;
}): Promise<void> {
  const staleBefore = subMinutes(new Date(), STUCK_PROCESSING_MINUTES);

  const stuck = await prisma.meeting.findMany({
    where: {
      // Only meetings whose recording is actually ready to summarize.
      recording: { transcript: { not: Prisma.DbNull } },
      OR: [
        { processingStatus: MeetingProcessingStatus.PENDING },
        {
          processingStatus: {
            in: [
              MeetingProcessingStatus.PROCESSING,
              MeetingProcessingStatus.FAILED,
            ],
          },
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    select: { id: true },
    take: 50,
  });
  if (stuck.length === 0) return;

  for (const meeting of stuck) {
    await enqueueMeetingProcessing({ meetingId: meeting.id, logger });
  }

  logger.info("Requeued stuck meeting processing", { count: stuck.length });
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
    // Anything more pulls the stored transcript blob for every row.
    select: { id: true, botProvider: true, externalBotId: true },
    take: 50,
  });

  for (const recording of recordings) {
    await deleteRecordingMedia({ recording, logger });
  }
}
