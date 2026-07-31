import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { loadRecentOtpSummary } from "./summary";

const logger = createTestLogger();
const now = new Date("2026-07-31T12:00:00.000Z");

describe("loadRecentOtpSummary", () => {
  it("returns only recent OTP threads without message bodies", async () => {
    const provider = {
      getThreadsWithQuery: vi.fn().mockResolvedValue({
        threads: [
          thread(
            "otp",
            "Your verification code is 123456",
            "2026-07-31T11:50:00.000Z",
          ),
          thread(
            "alert",
            "Suspicious login attempt",
            "2026-07-31T11:55:00.000Z",
          ),
          thread(
            "old",
            "Your login code is 654321",
            "2026-07-31T11:44:00.000Z",
          ),
        ],
      }),
    } as unknown as EmailProvider;

    const result = await loadRecentOtpSummary({
      accounts: [
        { id: "account-1", email: "one@example.com", provider: "google" },
      ],
      createProvider: vi.fn().mockResolvedValue(provider),
      logger,
      now,
    });

    expect(provider.getThreadsWithQuery).toHaveBeenCalledWith({
      query: {
        type: "inbox",
        after: new Date("2026-07-31T11:45:00.000Z"),
      },
      maxResults: 20,
    });
    expect(result).toMatchObject({
      accounts: [
        {
          accountId: "account-1",
          threads: [
            {
              id: "otp",
              messages: [
                {
                  subject: "Your verification code is 123456",
                  textPlain: undefined,
                },
              ],
            },
          ],
        },
      ],
      failedAccountIds: [],
    });
  });

  it("keeps working accounts when another provider fails", async () => {
    const result = await loadRecentOtpSummary({
      accounts: [
        { id: "working", email: "one@example.com", provider: "google" },
        { id: "failed", email: "two@example.com", provider: "microsoft" },
      ],
      createProvider: vi.fn(async (account) => {
        if (account.id === "failed") throw new Error("Reconnect required");
        return {
          getThreadsWithQuery: vi.fn().mockResolvedValue({ threads: [] }),
        } as unknown as EmailProvider;
      }),
      logger,
      now,
    });

    expect(result.accounts).toEqual([
      { accountId: "working", email: "one@example.com", threads: [] },
    ]);
    expect(result.failedAccountIds).toEqual(["failed"]);
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
        textPlain: "Sensitive email body",
        threadId: id,
      },
    ],
  };
}
