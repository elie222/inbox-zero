import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendColdEmailNotification as sendViaResend } from "@inboxzero/transactional-email";
import { createScopedLogger } from "@/utils/logger";
import { sendColdEmailNotification } from "./send-notification";

vi.mock("@inboxzero/transactional-email", () => ({
  sendColdEmailNotification: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "notifications@example.test",
    NEXT_PUBLIC_BASE_URL: "https://example.test",
  },
}));

describe("sendColdEmailNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendViaResend).mockResolvedValue({
      data: { id: "notification_1" },
      error: null,
    });
  });

  it.each([
    ["Hello", "Re: Hello"],
    ["re: Hello", "re: Hello"],
    ["a".repeat(3000), `Re: ${"a".repeat(3000)}`],
  ])("preserves reply formatting and threading case %#", async (originalSubject, subject) => {
    const result = await sendColdEmailNotification({
      senderEmail: "sender@example.test",
      recipientEmail: "recipient@example.test",
      originalSubject,
      originalMessageId: "<original@example.test>",
      logger: createScopedLogger("cold-email-notification-test"),
    });

    expect(result).toEqual({ success: true });
    expect(sendViaResend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject,
        inReplyTo: "<original@example.test>",
        replyTo: "recipient@example.test",
        to: "sender@example.test",
      }),
    );
  });
});
