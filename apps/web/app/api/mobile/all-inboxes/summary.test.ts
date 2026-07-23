import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { loadAllInboxesSummary } from "./summary";

const logger = createTestLogger();

describe("loadAllInboxesSummary", () => {
  it("keeps account results isolated and returns useful partial data", async () => {
    const accountOneProvider = createProvider({
      inbox: [
        thread("newsletter-thread", ["INBOX", "newsletter-label"]),
        thread("regular-thread", ["INBOX"]),
      ],
      replies: [thread("reply-thread", ["INBOX", "reply-label"])],
    });
    const accountTwoProvider = createProvider({
      inboxError: new Error("Inbox unavailable"),
      replies: [thread("second-reply", ["INBOX", "reply-label"])],
    });

    const result = await loadAllInboxesSummary({
      accounts: [
        { id: "account-1", email: "one@example.com", provider: "google" },
        { id: "account-2", email: "two@example.com", provider: "microsoft" },
      ],
      after: new Date("2026-07-23T00:00:00.000Z"),
      createProvider: vi.fn(async (account) =>
        account.id === "account-1" ? accountOneProvider : accountTwoProvider,
      ),
      logger,
    });

    expect(result.failedAccountIds).toEqual([]);
    expect(
      result.accounts[0].categories[0].threads[0].messages[0],
    ).toMatchObject({
      id: "newsletter-thread-message",
      textPlain: undefined,
      attachments: undefined,
    });
    expect(result.accounts).toMatchObject([
      {
        accountId: "account-1",
        email: "one@example.com",
        status: "ok",
        replies: [{ id: "reply-thread" }],
        categories: [
          {
            name: "Newsletters",
            threads: [{ id: "newsletter-thread" }],
          },
        ],
      },
      {
        accountId: "account-2",
        email: "two@example.com",
        status: "partial",
        replies: [{ id: "second-reply" }],
      },
    ]);
  });

  it("limits provider initialization to four accounts at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const createProvider = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return createProviderResult();
    });

    await loadAllInboxesSummary({
      accounts: Array.from({ length: 7 }, (_, index) => ({
        id: `account-${index}`,
        email: `account-${index}@example.com`,
        provider: "google",
      })),
      after: new Date("2026-07-23T00:00:00.000Z"),
      createProvider,
      logger,
    });

    expect(createProvider).toHaveBeenCalledTimes(7);
    expect(maxActive).toBe(4);
  });

  it("marks an account failed without dropping successful accounts", async () => {
    const result = await loadAllInboxesSummary({
      accounts: [
        { id: "working", email: "working@example.com", provider: "google" },
        { id: "failed", email: "failed@example.com", provider: "microsoft" },
      ],
      after: new Date("2026-07-23T00:00:00.000Z"),
      createProvider: vi.fn(async (account) => {
        if (account.id === "failed") throw new Error("Reconnect required");
        return createProviderResult();
      }),
      logger,
    });

    expect(result.failedAccountIds).toEqual(["failed"]);
    expect(result.accounts.map((account) => account.status)).toEqual([
      "ok",
      "error",
    ]);
  });
});

function createProvider({
  inbox = [],
  replies = [],
  inboxError,
}: {
  inbox?: EmailThread[];
  replies?: EmailThread[];
  inboxError?: Error;
}) {
  return {
    getLabels: vi.fn(async () => [
      { id: "reply-label", name: "To Reply", type: "user" },
      { id: "newsletter-label", name: "Newsletter", type: "user" },
    ]),
    getThreadsWithQuery: vi.fn(async ({ query }) => {
      if (query?.type === "inbox") {
        if (inboxError) throw inboxError;
        return { threads: inbox };
      }
      return { threads: replies };
    }),
  } as unknown as EmailProvider;
}

function createProviderResult() {
  return createProvider({});
}

function thread(id: string, labelIds: string[]): EmailThread {
  return {
    id,
    snippet: id,
    messages: [
      {
        date: "2026-07-23T12:00:00.000Z",
        historyId: `${id}-history`,
        id: `${id}-message`,
        inline: [],
        threadId: id,
        labelIds,
        snippet: id,
        subject: id,
        headers: {
          date: "2026-07-23T12:00:00.000Z",
          from: "Sender <sender@example.com>",
          subject: id,
          to: "recipient@example.com",
        },
        textPlain: "A large email body that should not be in list responses.",
        attachments: [
          {
            attachmentId: "attachment-1",
            filename: "large.pdf",
            headers: {
              "content-description": "",
              "content-id": "",
              "content-transfer-encoding": "",
              "content-type": "application/pdf",
            },
            mimeType: "application/pdf",
            size: 10_000_000,
          },
        ],
      },
    ],
  };
}
