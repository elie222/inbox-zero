import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteRecordingMediaMock,
  enqueueProcessingForRecordingMock,
  mockPrisma,
} = vi.hoisted(() => ({
  deleteRecordingMediaMock: vi.fn(),
  enqueueProcessingForRecordingMock: vi.fn(),
  mockPrisma: {
    meetingRecording: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/utils/prisma", () => ({ default: mockPrisma }));
vi.mock("@/utils/qstash", () => ({
  withQstashOrInternal: (handler: unknown) => handler,
}));
vi.mock("@/utils/meeting-recorder/delete-media", () => ({
  deleteRecordingMedia: (...args: unknown[]) =>
    deleteRecordingMediaMock(...args),
}));
vi.mock("@/utils/meeting-recorder/enqueue-processing", () => ({
  enqueueProcessingForRecording: (...args: unknown[]) =>
    enqueueProcessingForRecordingMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { POST } from "./route";

describe("meeting recorder transcript route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.meetingRecording.findUnique.mockResolvedValue({
      id: "recording-1",
      botProvider: "recall",
      externalBotId: "bot-1",
      transcript: [{ speakerName: "Speaker", text: "Hello" }],
      transcriptFetchedAt: null,
      mediaDeletedAt: null,
      status: MeetingRecordingStatus.CALL_ENDED,
    });
    mockPrisma.meetingRecording.updateMany.mockResolvedValue({ count: 1 });
  });

  it("finishes a recording when a retry finds an already-stored transcript", async () => {
    const response = await POST(
      new Request("https://example.com/api/meeting-recorder/transcript", {
        method: "POST",
        body: JSON.stringify({ recordingId: "recording-1" }),
      }) as never,
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.meetingRecording.updateMany).toHaveBeenCalledWith({
      where: {
        id: "recording-1",
        status: {
          in: expect.arrayContaining([MeetingRecordingStatus.CALL_ENDED]),
        },
      },
      data: {
        status: MeetingRecordingStatus.DONE,
        activeKey: null,
        transcriptFetchedAt: expect.any(Date),
      },
    });
    expect(deleteRecordingMediaMock).toHaveBeenCalledWith({
      recording: expect.objectContaining({ id: "recording-1" }),
      logger: expect.anything(),
    });
    expect(enqueueProcessingForRecordingMock).toHaveBeenCalledWith({
      recordingId: "recording-1",
      logger: expect.anything(),
    });
  });
});
