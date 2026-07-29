import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMeetingRecapEmail } from "@/utils/meeting-recorder/send-recap";

const { createUnsubscribeTokenMock, sendEmailWithHtmlMock } = vi.hoisted(
  () => ({
    createUnsubscribeTokenMock: vi.fn(),
    sendEmailWithHtmlMock: vi.fn(),
  }),
);

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    RESEND_API_KEY: undefined,
  },
}));
vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: (...args: unknown[]) =>
    createUnsubscribeTokenMock(...args),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({
    sendEmailWithHtml: (...args: unknown[]) => sendEmailWithHtmlMock(...args),
  }),
}));
vi.mock("@react-email/render", () => ({
  render: vi.fn().mockResolvedValue("<p>recap</p>"),
}));
vi.mock("@inboxzero/resend", () => ({
  sendMeetingRecapEmail: vi.fn(),
}));
vi.mock("@inboxzero/resend/emails/meeting-recap", () => ({
  default: vi.fn(() => null),
  generateMeetingRecapSubject: vi.fn(() => "Meeting recap"),
}));

describe("sendMeetingRecapEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUnsubscribeTokenMock.mockResolvedValue("recap-token");
  });

  it("creates an unsubscribe token scoped to meeting recaps", async () => {
    await sendMeetingRecapEmail({
      emailAccountId: "email-account-1",
      userEmail: "user@example.com",
      provider: "google",
      timezone: "UTC",
      meetingTitle: "Planning",
      startTime: new Date("2026-07-29T09:00:00.000Z"),
      summary: {
        overview: "Discussed the plan.",
        keyDecisions: [],
        actionItems: [],
        openQuestions: [],
        nextSteps: [],
      },
      followUpDraftCreated: false,
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      } as never,
    });

    expect(createUnsubscribeTokenMock).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      action: "meeting-recorder-recap",
    });
    expect(sendEmailWithHtmlMock).toHaveBeenCalledOnce();
  });
});
