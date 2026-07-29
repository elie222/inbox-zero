import { addMinutes } from "date-fns/addMinutes";
import { subHours } from "date-fns/subHours";
import { subMinutes } from "date-fns/subMinutes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  MeetingJoinRule,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { createTestLogger } from "@/__tests__/helpers";
import { FakeBotProvider } from "@/__tests__/db/fake-bot-provider";

vi.mock("server-only", () => ({}));

// Assigned in beforeAll; the mock factory only closes over it, so it is read
// at call time rather than at hoist time.
let fakeProvider: FakeBotProvider;

vi.mock("@/utils/meeting-recorder/create-bot-provider", () => ({
  DEFAULT_MEETING_BOT_PROVIDER: "recall",
  createMeetingBotProvider: () => fakeProvider,
}));

const fetchEventsMock = vi.hoisted(() => vi.fn());
vi.mock("@/utils/calendar/fetch-events-in-window", () => ({
  fetchCalendarEventsInWindow: (...args: unknown[]) => fetchEventsMock(...args),
}));

const enqueueMock = vi.hoisted(() => vi.fn());
vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: (...args: unknown[]) => enqueueMock(...args),
}));

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

/**
 * Reconciler tests against a real Postgres. The behaviour under test is almost
 * entirely unique constraints and conditional `updateMany` guards, which a
 * mocked Prisma cannot reproduce, so these need a live database.
 *
 * Setup: `createdb inboxzero_test && pnpm prisma migrate deploy` against it,
 * then `RUN_DB_TESTS=true DATABASE_URL=...inboxzero_test pnpm vitest --run __tests__/db`
 */
describe.skipIf(!RUN_DB_TESTS)(
  "meeting recorder reconciler (real database)",
  { timeout: 60_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let reconcile: typeof import("@/utils/meeting-recorder/reconcile");
    const logger = createTestLogger();

    const ACCOUNT_A = "recorder-a@example.com";
    const ACCOUNT_B = "recorder-b@example.com";
    let accountAId: string;
    let accountBId: string;

    beforeAll(async () => {
      fakeProvider = new FakeBotProvider();
      prisma = (await import("@/utils/prisma")).default;
      reconcile = await import("@/utils/meeting-recorder/reconcile");
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      fakeProvider.reset();

      await prisma.meeting.deleteMany({});
      await prisma.meetingRecording.deleteMany({});
      await prisma.emailAccount.deleteMany({
        where: { email: { in: [ACCOUNT_A, ACCOUNT_B] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ACCOUNT_A, ACCOUNT_B] } },
      });

      accountAId = await seedAccount(prisma, ACCOUNT_A);
      accountBId = await seedAccount(prisma, ACCOUNT_B);
    });

    afterAll(async () => {
      await prisma.meeting.deleteMany({});
      await prisma.meetingRecording.deleteMany({});
      await prisma.emailAccount.deleteMany({
        where: { email: { in: [ACCOUNT_A, ACCOUNT_B] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ACCOUNT_A, ACCOUNT_B] } },
      });
      await prisma.$disconnect();
    });

    function account(id: string, email: string) {
      return {
        id,
        email,
        meetingRecorderJoinRule: MeetingJoinRule.EXTERNAL_ONLY,
      };
    }

    test("keeps recordings isolated between accounts", async () => {
      const event = calendarEvent();

      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: { ...event, id: "event-b" },
        logger,
      });

      expect(fakeProvider.scheduled).toHaveLength(2);

      const recordings = await prisma.meetingRecording.findMany();
      expect(recordings).toHaveLength(2);

      const meetings = await prisma.meeting.findMany();
      expect(meetings).toHaveLength(2);
      expect(new Set(meetings.map((meeting) => meeting.recordingId)).size).toBe(
        2,
      );
    });

    test("cancels only the account's own bot", async () => {
      const event = calendarEvent();
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: { ...event, id: "event-b" },
        logger,
      });

      // Account A opts out of this one meeting.
      await prisma.meeting.updateMany({
        where: { emailAccountId: accountAId },
        data: { joinOverride: false },
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });

      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
      ]);
      const accountBMeeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountBId },
        include: { recording: true },
      });
      expect(accountBMeeting.recording?.status).toBe(
        MeetingRecordingStatus.SCHEDULED,
      );

      // Now the last interested account opts out too.
      await prisma.meeting.updateMany({
        where: { emailAccountId: accountBId },
        data: { joinOverride: false },
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: { ...event, id: "event-b" },
        logger,
      });

      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
        fakeProvider.scheduled[1]?.botId,
      ]);
    });

    test("books again after the user toggles a meeting off and back on", async () => {
      const event = calendarEvent();
      const emailAccount = account(accountAId, ACCOUNT_A);

      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });

      await prisma.meeting.updateMany({
        where: { emailAccountId: accountAId },
        data: { joinOverride: false },
      });
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });
      expect(fakeProvider.cancelled).toHaveLength(1);

      // Toggling back on must not be blocked by the cancelled row still
      // occupying the (url, start time) dedup slot.
      await prisma.meeting.updateMany({
        where: { emailAccountId: accountAId },
        data: { joinOverride: true },
      });
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });

      expect(fakeProvider.scheduled).toHaveLength(2);
      const meeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountAId },
      });
      expect(meeting.recordingId).not.toBeNull();
    });

    test("moves the bot when the event is rescheduled", async () => {
      const event = calendarEvent();
      const emailAccount = account(accountAId, ACCOUNT_A);
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });
      fakeProvider.replacementBotIdOnNextUpdate = "replacement_bot";

      const movedTo = addMinutes(event.startTime, 45);
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: {
          ...event,
          startTime: movedTo,
          endTime: addMinutes(movedTo, 30),
        },
        logger,
      });

      expect(fakeProvider.updated).toContainEqual(
        expect.objectContaining({
          botId: fakeProvider.scheduled[0]?.botId,
          joinAt: movedTo,
        }),
      );
      const recording = await prisma.meetingRecording.findFirstOrThrow();
      expect(recording.meetingStartTime).toEqual(movedTo);
      expect(recording.externalBotId).toBe("replacement_bot");
    });

    test("waits to reschedule while a conflicting recording is cancelling", async () => {
      const event = calendarEvent();
      const emailAccount = account(accountAId, ACCOUNT_A);
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });
      const original = await prisma.meetingRecording.findFirstOrThrow();
      const movedTo = addMinutes(event.startTime, 45);

      const cancelling = await prisma.meetingRecording.create({
        data: {
          botProvider: original.botProvider,
          externalBotId: "cancelling_bot",
          meetingUrl: original.meetingUrl,
          normalizedMeetingUrl: original.normalizedMeetingUrl,
          activeKey: original.activeKey,
          meetingStartTime: movedTo,
          status: MeetingRecordingStatus.CANCELLING,
        },
      });

      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: {
          ...event,
          startTime: movedTo,
          endTime: addMinutes(movedTo, 30),
        },
        logger,
      });

      expect(fakeProvider.updated).toHaveLength(0);
      expect(
        (
          await prisma.meetingRecording.findUniqueOrThrow({
            where: { id: original.id },
          })
        ).meetingStartTime,
      ).toEqual(event.startTime);

      await prisma.meetingRecording.update({
        where: { id: cancelling.id },
        data: {
          status: MeetingRecordingStatus.CANCELLED,
          activeKey: null,
        },
      });
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: {
          ...event,
          startTime: movedTo,
          endTime: addMinutes(movedTo, 30),
        },
        logger,
      });

      expect(fakeProvider.updated).toContainEqual(
        expect.objectContaining({
          botId: original.externalBotId,
          joinAt: movedTo,
        }),
      );
    });

    test("restores the bot when cancellation races with rescheduling", async () => {
      const event = calendarEvent();
      const emailAccount = account(accountAId, ACCOUNT_A);
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });
      const original = await prisma.meetingRecording.findFirstOrThrow();
      const movedTo = addMinutes(event.startTime, 45);
      const conflicting = await prisma.meetingRecording.create({
        data: {
          botProvider: original.botProvider,
          externalBotId: "conflicting_bot",
          meetingUrl: original.meetingUrl,
          normalizedMeetingUrl: original.normalizedMeetingUrl,
          activeKey: original.activeKey,
          meetingStartTime: movedTo,
          status: MeetingRecordingStatus.SCHEDULED,
        },
      });
      fakeProvider.replacementBotIdOnNextUpdate = "moved_bot";
      fakeProvider.beforeNextUpdate = async () => {
        await prisma.meetingRecording.update({
          where: { id: conflicting.id },
          data: { status: MeetingRecordingStatus.CANCELLING },
        });
      };

      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: {
          ...event,
          startTime: movedTo,
          endTime: addMinutes(movedTo, 30),
        },
        logger,
      });

      expect(fakeProvider.updated).toEqual([
        {
          botId: original.externalBotId,
          joinAt: movedTo,
          meetingUrl: event.videoConferenceLink,
        },
        {
          botId: "moved_bot",
          joinAt: event.startTime,
          meetingUrl: original.meetingUrl,
        },
      ]);
      const restored = await prisma.meetingRecording.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(restored.externalBotId).toBe("moved_bot");
      expect(restored.meetingStartTime).toEqual(event.startTime);
    });

    test("tracks a replacement bot when a merge cancellation fails", async () => {
      const emailAccount = account(accountAId, ACCOUNT_A);
      const firstEvent = calendarEvent();
      const secondEvent = calendarEvent({
        id: "event-second",
        startTime: addMinutes(firstEvent.startTime, 45),
        endTime: addMinutes(firstEvent.endTime, 45),
      });

      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: firstEvent,
        logger,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: secondEvent,
        logger,
      });

      const firstMeeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountAId, calendarEventId: firstEvent.id },
        include: { recording: true },
      });
      fakeProvider.replacementBotIdOnNextUpdate = "replacement_bot";
      fakeProvider.failNextCancel = true;

      await expect(
        reconcile.reconcileSingleEvent({
          emailAccount,
          event: {
            ...firstEvent,
            startTime: secondEvent.startTime,
            endTime: secondEvent.endTime,
          },
          logger,
        }),
      ).rejects.toThrow("cancelBot failed");

      expect(
        (
          await prisma.meetingRecording.findUniqueOrThrow({
            where: { id: firstMeeting.recordingId ?? "" },
          })
        ).externalBotId,
      ).toBe("replacement_bot");

      await reconcile.sweepRecordings({ logger });

      expect(fakeProvider.cancelled).toContain("replacement_bot");
    });

    test("does not link a recording after cancellation claims it", async () => {
      const event = calendarEvent();
      const normalizedMeetingUrl = "meet.google.com/abc-defg-hij";
      const recording = await prisma.meetingRecording.create({
        data: {
          botProvider: "recall",
          externalBotId: "cancelling_during_link",
          meetingUrl: event.videoConferenceLink ?? "",
          normalizedMeetingUrl,
          activeKey: `${accountAId}:${normalizedMeetingUrl}`,
          meetingStartTime: event.startTime,
          status: MeetingRecordingStatus.SCHEDULED,
        },
      });
      const updateMeeting = prisma.meeting.update.bind(prisma.meeting);
      const updateSpy = vi
        .spyOn(prisma.meeting, "update")
        .mockImplementationOnce(async (args) => {
          await prisma.meetingRecording.update({
            where: { id: recording.id },
            data: { status: MeetingRecordingStatus.CANCELLING },
          });
          return updateMeeting(args);
        });

      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });

      updateSpy.mockRestore();
      const meeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountAId, calendarEventId: event.id },
      });
      expect(meeting.recordingId).toBeNull();
    });

    test("retries a claim whose provider call failed transiently", async () => {
      const event = calendarEvent();
      const emailAccount = account(accountAId, ACCOUNT_A);

      fakeProvider.failNextSchedule = { permanent: false };
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });

      // The claim is kept so the slot is not lost, but no bot exists yet.
      const claimed = await prisma.meetingRecording.findFirstOrThrow();
      expect(claimed.externalBotId).toBeNull();
      expect(claimed.status).toBe(MeetingRecordingStatus.PENDING);

      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });

      const booked = await prisma.meetingRecording.findFirstOrThrow();
      expect(booked.externalBotId).toBe(fakeProvider.scheduled[0]?.botId);
      expect(booked.status).toBe(MeetingRecordingStatus.SCHEDULED);
    });

    test("drops the claim when the provider rejects the meeting outright", async () => {
      const event = calendarEvent();
      fakeProvider.failNextSchedule = { permanent: true };

      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });

      expect(await prisma.meetingRecording.count()).toBe(0);
    });

    test("cancels the bot when the event disappears from the calendar", async () => {
      const event = calendarEvent();
      fetchEventsMock.mockResolvedValue({ events: [event], complete: true });

      await reconcile.reconcileAccount({
        emailAccount: account(accountAId, ACCOUNT_A),
        logger,
      });
      expect(fakeProvider.scheduled).toHaveLength(1);

      // The event is gone from the calendar on the next pass.
      fetchEventsMock.mockResolvedValue({ events: [], complete: true });
      await reconcile.reconcileAccount({
        emailAccount: account(accountAId, ACCOUNT_A),
        logger,
      });

      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
      ]);
    });

    test("keeps bots booked when the calendar fetch came back incomplete", async () => {
      const event = calendarEvent();
      fetchEventsMock.mockResolvedValue({ events: [event], complete: true });

      await reconcile.reconcileAccount({
        emailAccount: account(accountAId, ACCOUNT_A),
        logger,
      });
      expect(fakeProvider.scheduled).toHaveLength(1);

      // A provider outage looks identical to "every meeting was deleted", so
      // an incomplete fetch must not be treated as deletion.
      fetchEventsMock.mockResolvedValue({ events: [], complete: false });
      await reconcile.reconcileAccount({
        emailAccount: account(accountAId, ACCOUNT_A),
        logger,
      });

      expect(fakeProvider.cancelled).toHaveLength(0);
      const meeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountAId },
      });
      expect(meeting.recordingId).not.toBeNull();
    });

    test("rebooks when the organizer changes the join link", async () => {
      const event = calendarEvent();
      const emailAccount = account(accountAId, ACCOUNT_A);
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });

      const relinked = {
        ...event,
        videoConferenceLink: "https://meet.google.com/xyz-uvwx-rst",
      };
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: relinked,
        logger,
      });

      // The old bot is stood down and a new one booked against the new link.
      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
      ]);
      expect(fakeProvider.scheduled).toHaveLength(2);
      expect(fakeProvider.scheduled[1]?.meetingUrl).toBe(
        relinked.videoConferenceLink,
      );
    });

    test("releases every booking when the recorder is switched off", async () => {
      const event = calendarEvent();
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      expect(fakeProvider.scheduled).toHaveLength(1);

      await reconcile.releaseAccountBookings({
        emailAccountId: accountAId,
        logger,
      });

      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
      ]);
      const meeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountAId },
      });
      expect(meeting.recordingId).toBeNull();
    });

    test("retries provider cancellation after a transient failure", async () => {
      const event = calendarEvent();
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      fakeProvider.failNextCancel = true;

      await reconcile.releaseAccountBookings({
        emailAccountId: accountAId,
        logger,
      });

      const cancelling = await prisma.meetingRecording.findFirstOrThrow();
      expect(cancelling.status).toBe(MeetingRecordingStatus.CANCELLING);
      expect(fakeProvider.cancelled).toHaveLength(0);

      await reconcile.sweepRecordings({ logger });

      const cancelled = await prisma.meetingRecording.findFirstOrThrow();
      expect(cancelled.status).toBe(MeetingRecordingStatus.CANCELLED);
      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
      ]);
    });

    test("removes a bot that has already started joining", async () => {
      const event = calendarEvent();
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      await prisma.meetingRecording.updateMany({
        data: { status: MeetingRecordingStatus.JOINING },
      });

      await reconcile.releaseAccountBookings({
        emailAccountId: accountAId,
        logger,
      });

      expect(fakeProvider.cancelled).toEqual([
        fakeProvider.scheduled[0]?.botId,
      ]);
      expect((await prisma.meetingRecording.findFirstOrThrow()).status).toBe(
        MeetingRecordingStatus.CANCELLED,
      );
    });

    test("releases only automatic bookings when automatic joining is turned off", async () => {
      const automaticEvent = calendarEvent();
      const explicitEvent = calendarEvent({
        id: "explicit-event",
        videoConferenceLink: "https://meet.google.com/explicit-join",
      });
      const emailAccount = account(accountAId, ACCOUNT_A);

      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: automaticEvent,
        logger,
      });
      await reconcile.upsertMeeting({
        emailAccountId: accountAId,
        event: explicitEvent,
        joinOverride: true,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: explicitEvent,
        logger,
      });

      await reconcile.releaseAutomaticAccountBookings({
        emailAccountId: accountAId,
        logger,
      });

      const meetings = await prisma.meeting.findMany({
        where: { emailAccountId: accountAId },
      });
      expect(
        meetings.find(
          (meeting) => meeting.calendarEventId === automaticEvent.id,
        )?.recordingId,
      ).toBeNull();
      expect(
        meetings.find((meeting) => meeting.calendarEventId === explicitEvent.id)
          ?.recordingId,
      ).not.toBeNull();
    });

    test("only deletes media once the transcript has been stored", async () => {
      const withoutTranscript = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/aaa-bbbb-ccc",
          normalizedMeetingUrl: "meet.google.com/aaa-bbbb-ccc",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.DONE,
          externalBotId: "bot_no_transcript",
        },
      });
      const withTranscript = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/ddd-eeee-fff",
          normalizedMeetingUrl: "meet.google.com/ddd-eeee-fff",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.DONE,
          externalBotId: "bot_with_transcript",
          transcriptFetchedAt: new Date(),
          transcript: [],
        },
      });
      const failed = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/ggg-hhhh-iii",
          normalizedMeetingUrl: "meet.google.com/ggg-hhhh-iii",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.FAILED,
          externalBotId: "bot_failed",
        },
      });
      const cancelled = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/jjj-kkkk-lll",
          normalizedMeetingUrl: "meet.google.com/jjj-kkkk-lll",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.CANCELLED,
          externalBotId: "bot_cancelled",
        },
      });

      await reconcile.sweepRecordings({ logger });

      expect(fakeProvider.deletedMedia).toHaveLength(3);
      expect(fakeProvider.deletedMedia).toEqual(
        expect.arrayContaining([
          "bot_with_transcript",
          "bot_failed",
          "bot_cancelled",
        ]),
      );
      expect(
        (
          await prisma.meetingRecording.findUniqueOrThrow({
            where: { id: withoutTranscript.id },
          })
        ).mediaDeletedAt,
      ).toBeNull();
      expect(
        (
          await prisma.meetingRecording.findUniqueOrThrow({
            where: { id: withTranscript.id },
          })
        ).mediaDeletedAt,
      ).not.toBeNull();
      expect(
        (
          await prisma.meetingRecording.findUniqueOrThrow({
            where: { id: failed.id },
          })
        ).mediaDeletedAt,
      ).not.toBeNull();
      expect(
        (
          await prisma.meetingRecording.findUniqueOrThrow({
            where: { id: cancelled.id },
          })
        ).mediaDeletedAt,
      ).not.toBeNull();
    });

    test("updates a sole-owner bot when only the meeting password changes", async () => {
      const event = calendarEvent({
        videoConferenceLink: "https://acme.zoom.us/j/8123456789?pwd=old",
      });
      const emailAccount = account(accountAId, ACCOUNT_A);
      await reconcile.reconcileSingleEvent({ emailAccount, event, logger });
      expect(fakeProvider.scheduled).toHaveLength(1);

      // The organizer rotates the passcode. Normalization drops it, so this is
      // the same meeting, but the booked bot still holds the old link and would
      // be turned away at the door.
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: {
          ...event,
          videoConferenceLink: "https://acme.zoom.us/j/8123456789?pwd=new",
        },
        logger,
      });

      expect(fakeProvider.updated).toContainEqual({
        botId: fakeProvider.scheduled[0]?.botId,
        meetingUrl: "https://acme.zoom.us/j/8123456789?pwd=new",
      });
      expect(fakeProvider.scheduled).toHaveLength(1);
      expect(fakeProvider.cancelled).toHaveLength(0);
    });

    test("keeps account-specific meeting URLs on separate bots", async () => {
      const event = calendarEvent({
        videoConferenceLink:
          "https://teams.microsoft.com/l/meetup-join/19%3ameeting_A%40thread.v2/0?context=account-a",
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: {
          ...event,
          id: "event-b",
          videoConferenceLink:
            "https://teams.microsoft.com/l/meetup-join/19%3ameeting_A%40thread.v2/0?context=account-b",
        },
        logger,
      });

      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: {
          ...event,
          id: "event-b",
          videoConferenceLink:
            "https://teams.microsoft.com/l/meetup-join/19%3ameeting_A%40thread.v2/0?context=account-b",
        },
        logger,
      });

      expect(fakeProvider.updated).toHaveLength(0);
      expect(fakeProvider.cancelled).toHaveLength(0);
      expect(fakeProvider.scheduled).toHaveLength(2);
    });

    test("stores the join link encrypted at rest", async () => {
      // The raw link carries the meeting password for Zoom and Teams, so anyone
      // with a database read or a backup could join users' calls.
      const meetingUrl = "https://acme.zoom.us/j/8123456789?pwd=SuPerSecret";
      const recording = await prisma.meetingRecording.create({
        data: {
          meetingUrl,
          normalizedMeetingUrl: "zoom.us/j/8123456789",
          activeKey: "zoom.us/j/8123456789",
          meetingStartTime: new Date(),
        },
      });

      const [stored] = await prisma.$queryRawUnsafe<{ meetingUrl: string }[]>(
        'SELECT "meetingUrl" FROM "MeetingRecording" WHERE id = $1',
        recording.id,
      );
      expect(stored?.meetingUrl).not.toContain("SuPerSecret");

      // Still readable through the client, which is what the bot provider uses.
      const read = await prisma.meetingRecording.findUniqueOrThrow({
        where: { id: recording.id },
      });
      expect(read.meetingUrl).toBe(meetingUrl);
    });

    test("keeps back-to-back meetings in the same room separate", async () => {
      // A personal room or standing team room has a permanent link, so two
      // different meetings in it differ only by start time.
      const room = "https://acme.zoom.us/j/8123456789";
      const first = calendarEvent({
        id: "event-first",
        videoConferenceLink: room,
        startTime: addMinutes(new Date(), 10),
      });
      const second = calendarEvent({
        id: "event-second",
        videoConferenceLink: room,
        startTime: addMinutes(new Date(), 30),
      });

      const emailAccount = account(accountAId, ACCOUNT_A);
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: first,
        logger,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount,
        event: second,
        logger,
      });

      // Sharing one recording would put the first meeting's transcript on the
      // second meeting, and leave one of them with no notes at all.
      const recordings = await prisma.meetingRecording.findMany();
      expect(recordings).toHaveLength(2);
      expect(fakeProvider.scheduled).toHaveLength(2);

      const meetings = await prisma.meeting.findMany({
        orderBy: { startTime: "asc" },
      });
      expect(meetings[0]?.recordingId).not.toBe(meetings[1]?.recordingId);
    });

    test("does not share recordings across accounts with equivalent raw links", async () => {
      // A Teams meetup-join URL carries a per-invitee `context` parameter, so
      // the same call legitimately looks different to each attendee.
      const base =
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123%40thread.v2/0";
      const event = calendarEvent({
        videoConferenceLink: `${base}?context=%7b%22Tid%22%3a%22tenant-a%22%7d`,
      });
      const otherEvent = {
        ...event,
        id: "event-b",
        videoConferenceLink: `${base}?context=%7b%22Tid%22%3a%22tenant-b%22%7d`,
      };

      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: otherEvent,
        logger,
      });

      expect(fakeProvider.scheduled).toHaveLength(2);

      // Moving the event proves which branch ran. Treating the differing raw
      // link as a changed meeting releases and rebooks; recognising it as the
      // same meeting updates the existing account-scoped bot.
      const movedTo = addMinutes(otherEvent.startTime, 45);
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountBId, ACCOUNT_B),
        event: { ...otherEvent, startTime: movedTo },
        logger,
      });

      expect(fakeProvider.updated).toContainEqual(
        expect.objectContaining({
          botId: fakeProvider.scheduled[1]?.botId,
          joinAt: movedTo,
        }),
      );
      expect(fakeProvider.cancelled).toHaveLength(0);
      expect(fakeProvider.scheduled).toHaveLength(2);
    });

    test("stops retrying a meeting that keeps failing to process", async () => {
      const event = calendarEvent();
      await reconcile.reconcileSingleEvent({
        emailAccount: account(accountAId, ACCOUNT_A),
        event,
        logger,
      });

      const meeting = await prisma.meeting.findFirstOrThrow({
        where: { emailAccountId: accountAId },
      });
      await prisma.meetingRecording.update({
        where: { id: meeting.recordingId ?? "" },
        data: { transcript: [], status: MeetingRecordingStatus.DONE },
      });
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          processingStatus: "FAILED",
          // Every attempt runs the summarization model, so this has to stop.
          processingAttempts: 5,
          updatedAt: subHours(new Date(), 1),
        },
      });

      await reconcile.sweepRecordings({ logger });

      expect(enqueueMock).not.toHaveBeenCalled();
    });

    test("requeues the oldest stuck meetings first", async () => {
      const now = new Date();
      await prisma.meetingRecording.createMany({
        data: Array.from({ length: 51 }, (_, index) => ({
          id: `stuck-recording-${index}`,
          meetingUrl: `https://meet.google.com/stuck-${index}`,
          normalizedMeetingUrl: `meet.google.com/stuck-${index}`,
          meetingStartTime: subMinutes(now, 51 - index),
          status: MeetingRecordingStatus.DONE,
          transcript: [],
        })),
      });
      await prisma.meeting.createMany({
        data: Array.from({ length: 51 }, (_, index) => ({
          id: `stuck-meeting-${index}`,
          calendarEventId: `stuck-event-${index}`,
          eventTitle: "Stuck meeting",
          startTime: subMinutes(now, 51 - index),
          endTime: subMinutes(now, 50 - index),
          attendees: [],
          emailAccountId: accountAId,
          recordingId: `stuck-recording-${index}`,
          // A PENDING row only counts as stuck once it has sat unclaimed past
          // the stale window; a fresh fan-out must not be re-enqueued.
          updatedAt: subMinutes(now, 30),
        })),
      });

      await reconcile.sweepRecordings({ logger });

      const enqueuedIds = enqueueMock.mock.calls.map(
        ([payload]) => payload.body.meetingId,
      );
      expect(enqueuedIds).toContain("stuck-meeting-0");
      expect(enqueuedIds).not.toContain("stuck-meeting-50");
    });

    test("re-requests transcription when the first request never produced one", async () => {
      const recording = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/mmm-nnnn-ooo",
          normalizedMeetingUrl: "meet.google.com/mmm-nnnn-ooo",
          activeKey: "meet.google.com/mmm-nnnn-ooo",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.CALL_ENDED,
          externalBotId: "bot_awaiting_transcript",
          externalRecordingId: "rec_awaiting",
          // The claim is never released on failure, so without this sweep the
          // recording would sit here forever.
          transcriptRequestedAt: subHours(new Date(), 4),
        },
      });

      await reconcile.sweepRecordings({ logger });

      expect(fakeProvider.transcriptsRequested).toEqual(["rec_awaiting"]);
      const retried = await prisma.meetingRecording.findUniqueOrThrow({
        where: { id: recording.id },
      });
      expect(retried.transcriptRequestedAt?.getTime()).toBeGreaterThan(
        recording.transcriptRequestedAt?.getTime() ?? 0,
      );
    });

    test("leaves a recent transcription request alone", async () => {
      await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/ppp-qqqq-rrr",
          normalizedMeetingUrl: "meet.google.com/ppp-qqqq-rrr",
          activeKey: "meet.google.com/ppp-qqqq-rrr",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.CALL_ENDED,
          externalBotId: "bot_recent_request",
          externalRecordingId: "rec_recent",
          transcriptRequestedAt: new Date(),
        },
      });

      await reconcile.sweepRecordings({ logger });

      // Re-requesting a transcript that is merely slow would pay for it twice.
      expect(fakeProvider.transcriptsRequested).toEqual([]);
    });

    test("clears stale claims and fails recordings that never reported back", async () => {
      const stale = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/ggg-hhhh-iii",
          normalizedMeetingUrl: "meet.google.com/ggg-hhhh-iii",
          activeKey: "meet.google.com/ggg-hhhh-iii",
          meetingStartTime: new Date(),
          status: MeetingRecordingStatus.PENDING,
          createdAt: subMinutes(new Date(), 30),
        },
      });
      const abandoned = await prisma.meetingRecording.create({
        data: {
          meetingUrl: "https://meet.google.com/jjj-kkkk-lll",
          normalizedMeetingUrl: "meet.google.com/jjj-kkkk-lll",
          activeKey: "meet.google.com/jjj-kkkk-lll",
          meetingStartTime: subHours(new Date(), 48),
          status: MeetingRecordingStatus.SCHEDULED,
          externalBotId: "bot_abandoned",
        },
      });

      await reconcile.sweepRecordings({ logger });

      expect(
        await prisma.meetingRecording.findUnique({ where: { id: stale.id } }),
      ).toBeNull();

      const failed = await prisma.meetingRecording.findUniqueOrThrow({
        where: { id: abandoned.id },
      });
      expect(failed.status).toBe(MeetingRecordingStatus.FAILED);
      // The slot must be released so a later meeting on the same link can book.
      expect(failed.activeKey).toBeNull();
    });
  },
);

function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-a",
    title: "Strategy sync",
    startTime: addMinutes(new Date(), 20),
    endTime: addMinutes(new Date(), 50),
    videoConferenceLink: "https://meet.google.com/abc-defg-hij",
    attendees: [{ email: "guest@other-company.com", name: "Guest" }],
    ...overrides,
  };
}

async function seedAccount(
  prisma: typeof import("@/utils/prisma").default,
  email: string,
): Promise<string> {
  const user = await prisma.user.create({ data: { email } });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      provider: "google",
      providerAccountId: `provider-${email}`,
      type: "oauth",
    },
  });
  const emailAccount = await prisma.emailAccount.create({
    data: {
      email,
      userId: user.id,
      accountId: account.id,
      meetingRecorderEnabled: true,
    },
  });

  return emailAccount.id;
}
