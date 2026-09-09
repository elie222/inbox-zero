import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MeetingJoinRule,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

const { checkHasAccessMock, fetchEventsMock } = vi.hoisted(() => ({
  checkHasAccessMock: vi.fn(),
  fetchEventsMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/premium/server", () => ({
  checkHasAccess: (...args: unknown[]) => checkHasAccessMock(...args),
}));
vi.mock("@/utils/calendar/fetch-events-in-window", () => ({
  fetchCalendarEventsInWindow: (...args: unknown[]) => fetchEventsMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware({
    auth: {
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
    },
  });
});

import { GET } from "./route";

describe("meeting recorder upcoming route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkHasAccessMock.mockResolvedValue(false);
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      meetingRecorderJoinRule: MeetingJoinRule.ALL,
    } as never);
    prisma.meeting.findMany.mockResolvedValue([]);
    fetchEventsMock.mockResolvedValue({
      complete: true,
      events: [
        {
          id: "event-1",
          title: "Planning",
          startTime: new Date("2026-07-30T09:00:00.000Z"),
          endTime: new Date("2026-07-30T09:30:00.000Z"),
          videoConferenceLink: "https://meet.google.com/abc-defg-hij",
          attendees: [{ email: "guest@example.com" }],
        },
      ],
    });
  });

  it("does not promise recording to an account without plan access", async () => {
    const response = await GET(
      new Request(
        "https://example.com/api/user/meeting-recorder/upcoming",
      ) as never,
    );
    const body = await response.json();

    expect(body.events).toEqual([
      expect.objectContaining({ id: "event-1", willRecord: false }),
    ]);
  });

  it("exposes an existing booking after plan access is lost", async () => {
    prisma.meeting.findMany.mockResolvedValue([
      {
        id: "meeting-1",
        calendarEventId: "event-1",
        joinOverride: null,
        recording: {
          status: MeetingRecordingStatus.SCHEDULED,
          failureReason: null,
        },
      },
    ] as never);

    const response = await GET(
      new Request(
        "https://example.com/api/user/meeting-recorder/upcoming",
      ) as never,
    );
    const body = await response.json();

    expect(body.events).toEqual([
      expect.objectContaining({
        id: "event-1",
        meetingId: "meeting-1",
        hasCancellableBooking: true,
        joinOverride: null,
        willRecord: false,
      }),
    ]);
  });

  it("does not expose a terminal recording as an active booking", async () => {
    prisma.meeting.findMany.mockResolvedValue([
      {
        id: "meeting-1",
        calendarEventId: "event-1",
        joinOverride: null,
        recording: {
          status: MeetingRecordingStatus.DONE,
          failureReason: null,
        },
      },
    ] as never);

    const response = await GET(
      new Request(
        "https://example.com/api/user/meeting-recorder/upcoming",
      ) as never,
    );
    const body = await response.json();

    expect(body.events).toEqual([
      expect.objectContaining({
        id: "event-1",
        meetingId: "meeting-1",
        hasCancellableBooking: false,
        willRecord: false,
      }),
    ]);
  });
});
