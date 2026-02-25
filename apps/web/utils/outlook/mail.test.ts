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
