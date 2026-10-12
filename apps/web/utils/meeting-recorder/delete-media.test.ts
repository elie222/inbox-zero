import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import type { MeetingBotProvider } from "@/utils/meeting-recorder/bot-provider";
import { createMeetingBotProvider } from "@/utils/meeting-recorder/create-bot-provider";
import { releaseAccountRecordings } from "./delete-media";

vi.mock("@/utils/prisma");
vi.mock("@/utils/meeting-recorder/create-bot-provider", () => ({
  createMeetingBotProvider: vi.fn(),
}));

const logger = createTestLogger();

describe("releaseAccountRecordings", () => {
  const cancelBot = vi.fn<MeetingBotProvider["cancelBot"]>();
  const deleteMedia = vi.fn<MeetingBotProvider["deleteMedia"]>();

  beforeEach(() => {
    vi.clearAllMocks();
    cancelBot.mockResolvedValue(undefined);
    deleteMedia.mockResolvedValue(undefined);
    vi.mocked(createMeetingBotProvider).mockReturnValue({
      cancelBot,
      deleteMedia,
    } as unknown as MeetingBotProvider);
  });

  it("cancels bots that may still join and deletes media for every recording", async () => {
    prisma.meetingRecording.findMany.mockResolvedValue([
      {
        botProvider: "recall",
        externalBotId: "bot-scheduled",
        status: MeetingRecordingStatus.SCHEDULED,
      },
      {
        botProvider: "recall",
        externalBotId: "bot-done",
        status: MeetingRecordingStatus.DONE,
      },
    ] as Awaited<ReturnType<typeof prisma.meetingRecording.findMany>>);

    await releaseAccountRecordings({ emailAccountId: "account-1", logger });

    expect(prisma.meetingRecording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId: "account-1",
          mediaDeletedAt: null,
          externalBotId: { not: null },
        },
      }),
    );
    expect(cancelBot).toHaveBeenCalledTimes(1);
    expect(cancelBot).toHaveBeenCalledWith("bot-scheduled");
    expect(deleteMedia).toHaveBeenCalledWith("bot-scheduled");
    expect(deleteMedia).toHaveBeenCalledWith("bot-done");
  });

  it("propagates provider failures so the recording rows are kept", async () => {
    prisma.meetingRecording.findMany.mockResolvedValue([
      {
        botProvider: "recall",
        externalBotId: "bot-scheduled",
        status: MeetingRecordingStatus.SCHEDULED,
      },
    ] as Awaited<ReturnType<typeof prisma.meetingRecording.findMany>>);
    cancelBot.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      releaseAccountRecordings({ emailAccountId: "account-1", logger }),
    ).rejects.toThrow("provider unavailable");
    expect(deleteMedia).not.toHaveBeenCalled();
  });
});
