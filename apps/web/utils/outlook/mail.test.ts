import type { Message } from "@microsoft/microsoft-graph-types";
import { describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { sendEmailWithHtml } from "./mail";

vi.mock("@/utils/mail", () => ({
  ensureEmailSendingEnabled: vi.fn(),
}));

describe("sendEmailWithHtml", () => {
  it("parses formatted recipients when sending a new draft", async () => {
    const draftPost = vi.fn(async () => {
      return {
        id: "draft-1",
        conversationId: "conversation-1",
      } as Message;
    });
    const sendPost = vi.fn(async () => ({}));

    const client = createMockOutlookClient((path) => {
      if (path === "/me/messages") return { post: draftPost };
      if (path === "/me/messages/draft-1/send") return { post: sendPost };
      throw new Error(`Unexpected API path: ${path}`);
    });

    const result = await sendEmailWithHtml(
      client,
      {
        to: "Recipient Name <recipient@example.com>",
        replyTo: "Inbox Zero Assistant <owner+ai@example.com>",
        subject: "Subject",
        messageHtml: "<p>Hello</p>",
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(draftPost).toHaveBeenCalledWith(
      expect.objectContaining({
        toRecipients: [
          {
            emailAddress: {
              address: "recipient@example.com",
              name: "Recipient Name",
            },
          },
        ],
        replyTo: [
          {
            emailAddress: {
              address: "owner+ai@example.com",
              name: "Inbox Zero Assistant",
            },
          },
        ],
      }),
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "",
      conversationId: "conversation-1",
    });
  });

  it("parses formatted reply-to and from fields in createReply flow", async () => {
    const createReplyPost = vi.fn(async () => {
      return {
        id: "reply-draft-1",
        conversationId: "conversation-2",
        from: {
          emailAddress: {
            address: "owner@example.com",
          },
        },
      } as Message;
    });
    const patchReply = vi.fn(async () => ({}));
    const sendReplyPost = vi.fn(async () => ({}));

    const client = createMockOutlookClient((path) => {
      if (path === "/me/messages/original-123/createReply")
        return { post: createReplyPost };
      if (path === "/me/messages/reply-draft-1") return { patch: patchReply };
      if (path === "/me/messages/reply-draft-1/send")
        return { post: sendReplyPost };
      throw new Error(`Unexpected API path: ${path}`);
    });

    const result = await sendEmailWithHtml(
      client,
      {
        replyToEmail: {
          threadId: "thread-1",
          headerMessageId: "<header-id@example.com>",
          references: "<reference@example.com>",
          messageId: "original-123",
        },
        to: "Owner User <owner@example.com>",
        from: "Inbox Zero Assistant <owner@example.com>",
        replyTo: "Inbox Zero Assistant <owner+ai@example.com>",
        subject: "Re: Subject",
        messageHtml: "<p>Reply</p>",
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(patchReply).toHaveBeenCalledWith(
      expect.objectContaining({
        toRecipients: [
          {
            emailAddress: {
              address: "owner@example.com",
              name: "Owner User",
            },
          },
        ],
        from: {
          emailAddress: {
            address: "owner@example.com",
            name: "Inbox Zero Assistant",
          },
        },
        replyTo: [
          {
            emailAddress: {
              address: "owner+ai@example.com",
              name: "Inbox Zero Assistant",
            },
          },
        ],
      }),
    );
    expect(sendReplyPost).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "",
      conversationId: "conversation-2",
    });
  });
});

function createMockOutlookClient(
  getEndpoint: (path: string) => {
    post?: (body: unknown) => Promise<unknown>;
    patch?: (body: unknown) => Promise<unknown>;
  },
): OutlookClient {
  const api = vi.fn((path: string) => {
    const endpoint = getEndpoint(path);
    return {
      post: endpoint.post ?? vi.fn(async () => ({})),
      patch: endpoint.patch ?? vi.fn(async () => ({})),
    };
  });

  return {
    getClient: vi.fn(() => ({ api })),
  } as unknown as OutlookClient;
}
