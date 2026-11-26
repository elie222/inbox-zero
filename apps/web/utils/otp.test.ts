import { describe, expect, it } from "vitest";
import type { EmailThread } from "@/utils/email/types";
import { getRecentOtpThreads, isRecentOtpMessage } from "./otp";

describe("getRecentOtpThreads", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("keeps OTP messages from the last 15 minutes", () => {
    const recent = thread(
      "recent",
      "Your verification code is 123456",
      "2026-07-31T11:45:00.000Z",
    );
    const old = thread(
      "old",
      "Your login code is 654321",
      "2026-07-31T11:44:59.999Z",
    );

    expect(getRecentOtpThreads([old, recent], now)).toEqual([recent]);
  });

  it("ignores future timestamps and recent non-OTP mail", () => {
    expect(
      getRecentOtpThreads(
        [
          thread(
            "future",
            "Your security code is 123456",
            "2026-07-31T12:00:01.000Z",
          ),
          thread(
            "alert",
            "Suspicious login attempt",
            "2026-07-31T11:59:00.000Z",
          ),
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("keeps only the matching OTP message from a mixed thread", () => {
    const otp = thread(
      "mixed",
      "Your security code is 123456",
      "2026-07-31T11:55:00.000Z",
    );
    otp.messages.push({
      ...otp.messages[0],
      id: "newer-message",
      subject: "Your sign-in was successful",
      headers: {
        ...otp.messages[0].headers,
        subject: "Your sign-in was successful",
      },
      date: "2026-07-31T11:56:00.000Z",
    });

    expect(getRecentOtpThreads([otp], now)[0].messages).toHaveLength(1);
    expect(getRecentOtpThreads([otp], now)[0].messages[0].subject).toBe(
      "Your security code is 123456",
    );
  });

  it("uses Gmail's millisecond internalDate as the received time", () => {
    const recent = thread(
      "gmail",
      "Your verification code is 123456",
      "2026-07-31T10:00:00.000Z",
    );
    recent.messages[0].internalDate = String(now.getTime() - 5 * 60 * 1000);

    expect(getRecentOtpThreads([recent], now)).toHaveLength(1);
  });
});

describe("isRecentOtpMessage", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("rejects an OTP delivered more than 15 minutes ago", () => {
    const oldOtp = thread(
      "old",
      "Your verification code is 123456",
      "2026-07-31T11:44:59.999Z",
    ).messages[0];

    expect(isRecentOtpMessage(oldOtp, now)).toBe(false);
  });
});

function thread(id: string, subject: string, date: string): EmailThread {
  return {
    id,
    snippet: subject,
    messages: [
      {
        date,
        headers: {
          date,
          from: "Security <security@example.com>",
          subject,
          to: "user@example.com",
        },
        historyId: `${id}-history`,
        id: `${id}-message`,
        inline: [],
        snippet: subject,
        subject,
        threadId: id,
      },
    ],
  };
}
