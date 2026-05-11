import { describe, expect, it, vi } from "vitest";
import { collectSenderReplyExamples } from "./sender-reply-examples";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));

const logger = createScopedLogger("sender-reply-examples-test");

describe("collectSenderReplyExamples", () => {
  it("returns recent sent replies to the sender and excludes current-thread messages", async () => {
    const provider = createMockProvider({
      messages: [
        createMessage({
          id: "current-message",
          from: "user@example.com",
          to: "sender@example.com",
          textPlain: "Current thread reply should not be included.",
          labelIds: ["SENT"],
          internalDate: "2026-05-11T10:00:00Z",
        }),
        createMessage({
          id: "older-sent-reply",
          from: "user@example.com",
          to: "sender@example.com",
          textPlain: "Older sent reply.",
          labelIds: ["SENT"],
          internalDate: "2026-05-08T10:00:00Z",
        }),
        createMessage({
          id: "long-sent-reply",
          from: "user@example.com",
          to: "sender@example.com",
          textPlain: `${"Long sent reply. ".repeat(60)}Tail should be omitted.`,
          labelIds: ["SENT"],
          internalDate: "2026-05-09T10:00:00Z",
        }),
        createMessage({
          id: "newer-sent-reply",
          from: "user@example.com",
          to: "sender@example.com",
          textPlain: "Newer sent reply.",
          labelIds: ["SENT"],
          internalDate: "2026-05-10T10:00:00Z",
        }),
        createMessage({
          id: "received-message",
          from: "sender@example.com",
          to: "user@example.com",
          textPlain: "Incoming message should not be included.",
          labelIds: [],
          internalDate: "2026-05-09T10:00:00Z",
        }),
        createMessage({
          id: "oldest-sent-reply",
          from: "user@example.com",
          to: "sender@example.com",
          textPlain: "Oldest sent reply should not fit.",
          labelIds: ["SENT"],
          internalDate: "2026-05-06T10:00:00Z",
        }),
        createMessage({
          id: "other-recipient",
          from: "user@example.com",
          to: "someone@example.com",
          textPlain: "Other recipient should not be included.",
          labelIds: ["SENT"],
          internalDate: "2026-05-07T10:00:00Z",
        }),
      ],
    });

    const result = await collectSenderReplyExamples({
      emailAccount: createEmailAccount(),
      emailProvider: provider,
      senderEmail: "sender@example.com",
      currentMessageIds: new Set(["current-message"]),
      logger,
    });

    expect(provider.getThreadsWithParticipant).toHaveBeenCalledWith({
      participantEmail: "sender@example.com",
      maxThreads: 8,
    });
    expect(result?.count).toBe(3);
    expect(result?.content).toContain("Newer sent reply.");
    expect(result?.content).toContain("...");
    expect(result?.content).not.toContain("Tail should be omitted.");
    expect(result?.content).toContain("Older sent reply.");
    expect(result?.content).not.toContain("Oldest sent reply");
    expect(result?.content).not.toContain("Current thread reply");
    expect(result?.content).not.toContain("Incoming message");
    expect(result?.content).not.toContain("Other recipient");
    expect(result?.content.indexOf("Newer sent reply.")).toBeLessThan(
      result?.content.indexOf("Older sent reply.") ?? Number.POSITIVE_INFINITY,
    );
  });
});

function createMockProvider({
  messages,
}: {
  messages: ParsedMessage[];
}): EmailProvider {
  return {
    getThreadsWithParticipant: vi.fn().mockResolvedValue([
      {
        id: "thread-1",
        messages,
        snippet: "",
      },
    ]),
    isSentMessage: vi.fn((message: ParsedMessage) =>
      message.labelIds?.includes("SENT"),
    ),
  } as unknown as EmailProvider;
}

function createEmailAccount(): EmailAccountWithAI {
  return {
    id: "account-id",
    email: "user@example.com",
    userId: "user-id",
    timezone: "UTC",
    user: {
      aiProvider: null,
      aiModel: null,
      aiApiKey: null,
    },
  } as EmailAccountWithAI;
}

function createMessage({
  id,
  from,
  to,
  textPlain,
  labelIds,
  internalDate,
}: {
  id: string;
  from: string;
  to: string;
  textPlain: string;
  labelIds: string[];
  internalDate: string;
}): ParsedMessage {
  return {
    id,
    threadId: "thread-1",
    internalDate,
    date: internalDate,
    historyId: "history-id",
    inline: [],
    labelIds,
    snippet: textPlain,
    subject: "Subject",
    textHtml: `<p>${textPlain}</p>`,
    textPlain,
    headers: {
      from,
      to,
      subject: "Subject",
      date: internalDate,
      "message-id": `<${id}@example.com>`,
    },
  };
}
