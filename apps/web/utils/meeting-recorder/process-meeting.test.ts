import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { processMeetingForAccount } from "@/utils/meeting-recorder/process-meeting";

const {
  aiSummarizeMeetingMock,
  getEmailAccountWithAiMock,
  sendMeetingRecapEmailMock,
} = vi.hoisted(() => ({
  aiSummarizeMeetingMock: vi.fn(),
  getEmailAccountWithAiMock: vi.fn(),
  sendMeetingRecapEmailMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("@/utils/ai/meeting-recorder/summarize-meeting", () => ({
  aiSummarizeMeeting: (...args: unknown[]) => aiSummarizeMeetingMock(...args),
  parseMeetingSummary: () => null,
}));
vi.mock("@/utils/ai/meeting-recorder/draft-meeting-follow-up", () => ({
  aiDraftMeetingFollowUp: vi.fn(),
}));
vi.mock("@/utils/meeting-recorder/send-recap", () => ({
  sendMeetingRecapEmail: (...args: unknown[]) =>
    sendMeetingRecapEmailMock(...args),
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: (...args: unknown[]) =>
    getEmailAccountWithAiMock(...args),
  getWritingStyle: vi.fn(),
}));
vi.mock("@/utils/premium/server", () => ({
  checkHasAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

describe("processMeetingForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.meeting.updateMany.mockResolvedValue({ count: 1 });
    prisma.meeting.update.mockResolvedValue({} as never);
    prisma.meeting.findUnique.mockResolvedValue({
      id: "meeting-1",
      emailAccountId: "email-account-1",
      eventTitle: "Planning",
      attendees: [],
      recording: {
        transcript: [
          {
            speakerName: "Speaker",
            isHost: true,
            startTime: 0,
            endTime: 1,
            text: "Hello",
          },
        ],
      },
      emailAccount: {
        meetingRecorderEnabled: false,
        meetingRecorderRecapEmailEnabled: true,
        meetingRecorderFollowUpDraftEnabled: true,
      },
    } as never);
    getEmailAccountWithAiMock.mockResolvedValue({
      id: "email-account-1",
      email: "user@example.com",
      userId: "user-1",
      account: { provider: "google" },
      user: {},
    });
  });

  it("does not process a queued meeting after the recorder is disabled", async () => {
    await processMeetingForAccount({
      meetingId: "meeting-1",
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      } as never,
    });

    expect(getEmailAccountWithAiMock).not.toHaveBeenCalled();
    expect(aiSummarizeMeetingMock).not.toHaveBeenCalled();
    expect(sendMeetingRecapEmailMock).not.toHaveBeenCalled();
  });
});
