import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { setMeetingJoinOverrideAction } from "./meeting-recorder";

const {
  mockAuth,
  mockCheckHasAccess,
  mockFetchEvents,
  mockReconcileSingleEvent,
  mockUpsertMeeting,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckHasAccess: vi.fn(),
  mockFetchEvents: vi.fn(),
  mockReconcileSingleEvent: vi.fn(),
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
  releaseAccountBookings: vi.fn(),
  upsertMeeting: mockUpsertMeeting,
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

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

    await setMeetingJoinOverrideAction(EMAIL_ACCOUNT_ID, {
      join: true,
      calendarEventId: "event-1",
    });

    expect(mockReconcileSingleEvent).toHaveBeenCalled();
  });
});
