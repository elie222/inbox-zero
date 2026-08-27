import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  deleteMeetingNotesAction,
  setMeetingJoinOverrideAction,
  updateMeetingRecorderSettingsAction,
} from "./meeting-recorder";

const {
  mockAuth,
  mockCheckHasAccess,
  mockFetchEvents,
  mockReconcileSingleEvent,
  mockReleaseAccountBookings,
  mockReleaseAutomaticAccountBookings,
  mockUpsertMeeting,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckHasAccess: vi.fn(),
  mockFetchEvents: vi.fn(),
  mockReconcileSingleEvent: vi.fn(),
  mockReleaseAccountBookings: vi.fn(),
  mockReleaseAutomaticAccountBookings: vi.fn(),
  mockUpsertMeeting: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({ auth: mockAuth }));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("@/utils/premium/server", () => ({
  checkHasAccess: mockCheckHasAccess,
}));
vi.mock("@/utils/calendar/fetch-events-in-window", () => ({
  fetchCalendarEventsInWindow: mockFetchEvents,
}));
vi.mock("@/utils/meeting-recorder/reconcile", () => ({
  reconcileSingleEvent: mockReconcileSingleEvent,
  releaseAccountBookings: mockReleaseAccountBookings,
  releaseAutomaticAccountBookings: mockReleaseAutomaticAccountBookings,
  upsertMeeting: mockUpsertMeeting,
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

describe("deleteMeetingNotesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
  });

  it("clears the summary and deletes the recording atomically", async () => {
    const clearMeeting = Promise.resolve({}) as never;
    const deleteRecording = Promise.resolve({}) as never;
    prisma.meeting.findFirst.mockResolvedValue({
      recordingId: "recording-1",
    } as never);
    prisma.meeting.update.mockReturnValue(clearMeeting);
    prisma.meetingRecording.delete.mockReturnValue(deleteRecording);

    const result = await deleteMeetingNotesAction(EMAIL_ACCOUNT_ID, {
      meetingId: "meeting-1",
    });

    expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
      where: {
        id: "meeting-1",
        emailAccountId: EMAIL_ACCOUNT_ID,
        recording: { emailAccountId: EMAIL_ACCOUNT_ID },
      },
      select: { recordingId: true },
    });
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: {
        id: "meeting-1",
        emailAccountId: EMAIL_ACCOUNT_ID,
        recordingId: "recording-1",
      },
      data: { recordingId: null, summary: Prisma.DbNull },
    });
    expect(prisma.meetingRecording.delete).toHaveBeenCalledWith({
      where: { id: "recording-1" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      clearMeeting,
      deleteRecording,
    ]);
    expect(result?.serverError).toBeUndefined();
  });

  it("does not delete notes that do not belong to the account", async () => {
    prisma.meeting.findFirst.mockResolvedValue(null);

    const result = await deleteMeetingNotesAction(EMAIL_ACCOUNT_ID, {
      meetingId: "another-account-meeting",
    });

    expect(prisma.meeting.update).not.toHaveBeenCalled();
    expect(prisma.meetingRecording.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result?.serverError).toBe("Meeting not found");
  });
});

describe("setMeetingJoinOverrideAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    // Ownership check inside the action client, then the action's own lookup.
    prisma.emailAccount.findUnique
      .mockResolvedValueOnce({
        email: "user@example.com",
        account: { userId: "user-1", provider: "google" },
      } as never)
      .mockResolvedValue({
        id: EMAIL_ACCOUNT_ID,
        email: "user@example.com",
        userId: "user-1",
        meetingRecorderEnabled: true,
        meetingRecorderJoinRule: "EXTERNAL_ONLY",
      } as never);

    // A meeting starting inside the cron window, so the action books inline.
    mockFetchEvents.mockResolvedValue({
      complete: true,
      events: [
        {
          id: "event-1",
          title: "Sync",
          startTime: new Date(Date.now() + 5 * 60 * 1000),
          endTime: new Date(Date.now() + 35 * 60 * 1000),
          videoConferenceLink: "https://meet.google.com/abc-defg-hij",
          attendees: [{ email: "guest@other.com" }],
        },
      ],
    });
    mockUpsertMeeting.mockResolvedValue({ id: "meeting-1" });
  });

  it("does not book a bot for an account without the paid tier", async () => {
    mockCheckHasAccess.mockResolvedValue(false);

    const result = await setMeetingJoinOverrideAction(EMAIL_ACCOUNT_ID, {
      join: true,
      calendarEventId: "event-1",
    });

    // Booking a bot costs money and puts a visibly branded bot in the call, so
    // this path has to agree with the cron, which filters on the paid tier.
    expect(mockReconcileSingleEvent).not.toHaveBeenCalled();
    expect(result?.serverError).toBeTruthy();
  });

  it("books for an entitled account", async () => {
    mockCheckHasAccess.mockResolvedValue(true);

    const result = await setMeetingJoinOverrideAction(EMAIL_ACCOUNT_ID, {
      join: true,
      calendarEventId: "event-1",
    });

    expect(mockReconcileSingleEvent).toHaveBeenCalled();
    expect(result?.serverError).toBeUndefined();
  });

  it("lets an account without the paid tier turn off an existing booking", async () => {
    mockCheckHasAccess.mockResolvedValue(false);

    const result = await setMeetingJoinOverrideAction(EMAIL_ACCOUNT_ID, {
      join: false,
      calendarEventId: "event-1",
    });

    expect(mockCheckHasAccess).not.toHaveBeenCalled();
    expect(mockUpsertMeeting).toHaveBeenCalledWith({
      emailAccountId: EMAIL_ACCOUNT_ID,
      event: expect.objectContaining({ id: "event-1" }),
      joinOverride: false,
    });
    expect(mockReconcileSingleEvent).toHaveBeenCalled();
    expect(result?.serverError).toBeUndefined();
  });

  it("reconciles an existing booking after the event moves outside the cron window", async () => {
    mockFetchEvents.mockResolvedValue({
      complete: true,
      events: [
        {
          id: "event-1",
          title: "Moved sync",
          startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
          videoConferenceLink: "https://meet.google.com/abc-defg-hij",
          attendees: [{ email: "guest@other.com" }],
        },
      ],
    });
    mockUpsertMeeting.mockResolvedValue({
      id: "meeting-1",
      recordingId: "recording-1",
    });
    mockCheckHasAccess.mockResolvedValue(true);

    const result = await setMeetingJoinOverrideAction(EMAIL_ACCOUNT_ID, {
      join: true,
      calendarEventId: "event-1",
    });

    expect(mockReconcileSingleEvent).toHaveBeenCalled();
    expect(result?.serverError).toBeUndefined();
  });
});

describe("updateMeetingRecorderSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
    prisma.emailAccount.update.mockResolvedValue({
      id: EMAIL_ACCOUNT_ID,
      meetingRecorderEnabled: true,
      meetingRecorderJoinRule: MeetingJoinRule.OFF,
    } as never);
  });

  it("releases automatic bookings immediately when automatic joining is turned off", async () => {
    const result = await updateMeetingRecorderSettingsAction(EMAIL_ACCOUNT_ID, {
      joinRule: MeetingJoinRule.OFF,
    });

    expect(mockReleaseAutomaticAccountBookings).toHaveBeenCalledWith({
      emailAccountId: EMAIL_ACCOUNT_ID,
      logger: expect.anything(),
    });
    expect(result?.serverError).toBeUndefined();
  });

  it("does not enable the recorder for an account without the paid tier", async () => {
    mockCheckHasAccess.mockResolvedValue(false);

    const result = await updateMeetingRecorderSettingsAction(EMAIL_ACCOUNT_ID, {
      enabled: true,
    });

    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(mockReleaseAccountBookings).not.toHaveBeenCalled();
    expect(result?.serverError).toBeTruthy();
  });
});
