import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { releaseMeetingBooking } from "@/utils/meeting-recorder/reconcile";
import { CANCELLABLE_STATUSES } from "@/utils/meeting-recorder/recording-lifecycle";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("@/utils/prisma");
vi.mock("@/utils/meeting-recorder/create-bot-provider", () => ({
  DEFAULT_MEETING_BOT_PROVIDER: "recall",
  createMeetingBotProvider: vi.fn(),
}));

describe("releaseMeetingBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.meeting.findFirst.mockResolvedValue({
      id: "meeting-1",
      recordingId: "recording-1",
    } as never);
  });

  it("keeps a recording linked if the call ends before detachment", async () => {
    prisma.meeting.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await releaseMeetingBooking({
      emailAccountId: "email-account-1",
      calendarEventId: "event-1",
      logger: createTestLogger(),
    });

    const detachCall = prisma.meeting.updateMany.mock.calls.find(
      ([args]) => args.data.recordingId === null,
    );
    expect(detachCall?.[0].where).toMatchObject({
      id: "meeting-1",
      recordingId: "recording-1",
      recording: { status: { in: CANCELLABLE_STATUSES } },
    });
    expect(CANCELLABLE_STATUSES).not.toContain(
      MeetingRecordingStatus.CALL_ENDED,
    );
    expect(prisma.meetingRecording.findUnique).not.toHaveBeenCalled();
  });
});
