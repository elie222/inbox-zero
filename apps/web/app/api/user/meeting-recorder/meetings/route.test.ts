import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
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

const NOW = new Date("2026-07-30T17:15:00.000Z");

describe("meeting recorder meetings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma.meeting.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps ongoing and no-show bookings out of the recorded section", async () => {
    await GET(
      new Request(
        "https://example.com/api/user/meeting-recorder/meetings",
      ) as never,
    );

    const where = prisma.meeting.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      emailAccountId: "email-account-1",
      endTime: { lte: NOW },
      recording: {
        status: {
          in: [
            MeetingRecordingStatus.JOINING,
            MeetingRecordingStatus.IN_WAITING_ROOM,
            MeetingRecordingStatus.IN_CALL,
            MeetingRecordingStatus.RECORDING,
            MeetingRecordingStatus.FAILED,
            MeetingRecordingStatus.CALL_ENDED,
            MeetingRecordingStatus.DONE,
          ],
        },
      },
    });
  });
});
