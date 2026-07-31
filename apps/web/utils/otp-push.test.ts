import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { sendMobilePushNotification } from "@/utils/mobile-push";
import type { ParsedMessage } from "@/utils/types";
import { sendOtpPushNotification } from "./otp-push";

vi.mock("@/utils/mobile-push", () => ({
  sendMobilePushNotification: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();
const now = new Date("2026-07-31T12:05:00.000Z");

describe("sendOtpPushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds an expiring OTP notification", async () => {
    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({
        id: "message-1",
        threadId: "thread-1",
        subject: "Your verification code is 123456",
      }),
      logger,
      now,
    });

    expect(sendMobilePushNotification).toHaveBeenCalledWith({
      userId: "user-1",
      deduplicationKey: "otp:account-1:message-1",
      notification: {
        title: "Verification code",
        body: "Your verification code is 123456",
        sound: "default",
        channelId: "otp",
        priority: "high",
        expiration: new Date("2026-07-31T12:15:00.000Z").getTime() / 1000,
        data: {
          type: "otp",
          url: "/thread/thread-1?accountId=account-1",
        },
      },
      logger,
    });
  });

  it("ignores messages without an OTP", async () => {
    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Suspicious login attempt" }),
      logger,
      now,
    });

    expect(sendMobilePushNotification).not.toHaveBeenCalled();
  });

  it("ignores OTP messages older than 15 minutes", async () => {
    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({
        date: "2026-07-31T11:49:59.999Z",
        subject: "Your login code is 123456",
      }),
      logger,
      now,
    });

    expect(sendMobilePushNotification).not.toHaveBeenCalled();
  });
});

function message(overrides: Partial<ParsedMessage>): ParsedMessage {
  const subject = overrides.subject ?? "Your verification code";
  return {
    date: "2026-07-31T12:00:00.000Z",
    headers: {
      date: "2026-07-31T12:00:00.000Z",
      from: "Security <security@example.com>",
      subject,
      to: "user@example.com",
    },
    historyId: "history-1",
    id: "message-1",
    inline: [],
    snippet: subject,
    subject,
    threadId: "thread-1",
    ...overrides,
  };
}
