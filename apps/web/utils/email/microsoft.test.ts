import type { Message } from "@microsoft/microsoft-graph-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlookProvider } from "./microsoft";

vi.mock("server-only", () => ({}));

describe("OutlookProvider.getLatestMessageInThread", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses converted date fallback when receivedDateTime is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T00:00:00Z"));

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "older-with-date",
          receivedDateTime: "2026-01-01T00:00:00.000Z",
          isDraft: false,
        }),
        createMessage({
          id: "missing-date",
          receivedDateTime: undefined,
          isDraft: false,
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest?.id).toBe("missing-date");
  });

  it("returns null when all messages are drafts", async () => {
    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "draft-1",
          receivedDateTime: "2026-01-01T00:00:00.000Z",
          isDraft: true,
        }),
        createMessage({
          id: "draft-2",
          receivedDateTime: undefined,
          isDraft: true,
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest).toBeNull();
  });
});

function createMockOutlookClient(messages: Message[]) {
  return {
    getClient: () => ({
      api: () => ({
        filter: () => ({
          select: () => ({
            get: async () => ({ value: messages }),
          }),
        }),
      }),
    }),
  } as any;
}

function createMessage({
  id,
  receivedDateTime,
  isDraft,
}: {
  id: string;
  receivedDateTime: string | undefined;
  isDraft: boolean;
}): Message {
  return {
    id,
    conversationId: "thread-1",
    conversationIndex: null,
    internetMessageId: `<${id}@example.com>`,
    subject: "Subject",
    bodyPreview: "",
    from: {
      emailAddress: {
        name: "Sender",
        address: "sender@example.com",
      },
    },
    sender: undefined,
    toRecipients: [
      {
        emailAddress: {
          name: "Recipient",
          address: "recipient@example.com",
        },
      },
    ],
    ccRecipients: [],
    receivedDateTime,
    isDraft,
    isRead: true,
    body: {
      contentType: "text",
      content: "",
    },
    categories: [],
    parentFolderId: undefined,
    hasAttachments: false,
  };
}
