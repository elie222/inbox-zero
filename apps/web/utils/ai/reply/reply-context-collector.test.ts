import { describe, expect, test, vi } from "vitest";
import { searchReplyContextEmails } from "./reply-context-collector";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));

describe("searchReplyContextEmails", () => {
  test("prioritizes search hits, nearby context, and sent replies in long threads", async () => {
    const threadMessages = Array.from({ length: 100 }, (_, index) =>
      getMessage({
        id: `message-${index + 1}`,
        textPlain: `Generic thread message ${index + 1}`,
      }),
    );
    const matchingMessage = getMessage({
      id: "message-70",
      textPlain: "The customer asks about a matching product issue.",
    });
    const sentReply = getMessage({
      id: "message-71",
      from: "account@example.com",
      labelIds: ["SENT"],
      textPlain: "The user explains the correct support path.",
    });

    threadMessages[69] = matchingMessage;
    threadMessages[70] = sentReply;

    const provider = getProvider({
      searchResults: [matchingMessage],
      threadMessages,
    });

    const results = await searchReplyContextEmails({
      emailProvider: provider,
      query: "product issue",
      after: new Date("2026-01-01T00:00:00Z"),
      currentThread: [
        {
          id: "current-message",
          threadId: "current-thread",
          from: "customer@example.com",
          to: "account@example.com",
          subject: "Current request",
          content: "Current request body",
        },
      ],
    });
    const resultIds = results.map((email) => email.id);

    expect(resultIds).toContain("message-70");
    expect(resultIds).toContain("message-71");
    expect(resultIds).toContain("message-69");
    expect(resultIds).not.toContain("message-1");
    expect(resultIds).not.toContain("message-40");
    expect(results.length).toBeLessThanOrEqual(12);
  });

  test("keeps short historical threads intact", async () => {
    const threadMessages = [
      getMessage({ id: "message-1", textPlain: "Matching request" }),
      getMessage({
        id: "message-2",
        from: "account@example.com",
        labelIds: ["SENT"],
        textPlain: "Useful answer",
      }),
      getMessage({ id: "message-3", textPlain: "Follow-up" }),
    ];
    const provider = getProvider({
      searchResults: [threadMessages[0]],
      threadMessages,
    });

    const results = await searchReplyContextEmails({
      emailProvider: provider,
      query: "request",
      after: new Date("2026-01-01T00:00:00Z"),
      currentThread: [],
    });

    expect(results.map((email) => email.id)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
  });
});

function getProvider({
  searchResults,
  threadMessages,
}: {
  searchResults: ParsedMessage[];
  threadMessages: ParsedMessage[];
}) {
  return {
    name: "google",
    getMessagesWithPagination: vi.fn().mockResolvedValue({
      messages: searchResults,
    }),
    getThreadMessages: vi.fn().mockResolvedValue(threadMessages),
  } as unknown as EmailProvider;
}

function getMessage({
  id,
  from = "customer@example.com",
  labelIds = ["INBOX"],
  parentFolderId,
  textPlain,
}: {
  id: string;
  from?: string;
  labelIds?: string[];
  parentFolderId?: string;
  textPlain: string;
}): ParsedMessage {
  return {
    id,
    threadId: "thread-1",
    historyId: "history-1",
    date: "2026-05-01T00:00:00.000Z",
    internalDate: "1777593600000",
    subject: "Test thread",
    snippet: textPlain,
    textPlain,
    textHtml: "",
    labelIds,
    parentFolderId,
    attachments: [],
    inline: [],
    headers: {
      from,
      to: "account@example.com",
      subject: "Test thread",
      date: "2026-05-01T00:00:00.000Z",
      "message-id": `<${id}@example.com>`,
    },
  };
}
