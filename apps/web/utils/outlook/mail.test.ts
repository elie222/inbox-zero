import type { Message } from "@microsoft/microsoft-graph-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { sendEmailWithHtml } from "./mail";

vi.mock("@/utils/mail", () => ({
  ensureEmailSendingEnabled: vi.fn(),
}));

describe("sendEmailWithHtml", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("decodes base64 string attachments before uploading", async () => {
    const draftPost = vi.fn(async () => {
      return {
        id: "draft-1",
        conversationId: "conversation-1",
      } as Message;
    });
    const attachmentPost = vi.fn(async () => ({}));
    const sendPost = vi.fn(async () => ({}));

    const client = createMockOutlookClient((path) => {
      if (path === "/me/messages") return { post: draftPost };
      if (path === "/me/messages/draft-1/attachments") {
        return { post: attachmentPost };
      }
      if (path === "/me/messages/draft-1/send") return { post: sendPost };
      throw new Error(`Unexpected API path: ${path}`);
    });

    const base64Content = Buffer.from("pdf-binary").toString("base64");

    await sendEmailWithHtml(
      client,
      {
        to: "recipient@example.com",
        subject: "Subject",
        messageHtml: "<p>Hello</p>",
        attachments: [
          {
            filename: "lease.pdf",
            content: base64Content,
            contentType: "application/pdf",
          },
        ],
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(attachmentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        contentBytes: base64Content,
      }),
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
  });

  it("uses an upload session for attachments above the Graph simple upload limit", async () => {
    const draftPost = vi.fn(async () => {
      return {
        id: "draft-1",
        conversationId: "conversation-1",
      } as Message;
    });
    const createUploadSessionPost = vi.fn(async () => ({
      uploadUrl: "https://upload.example.test/session",
    }));
    const sendPost = vi.fn(async () => ({}));
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockOutlookClient((path) => {
      if (path === "/me/messages") return { post: draftPost };
      if (path === "/me/messages/draft-1/attachments/createUploadSession") {
        return { post: createUploadSessionPost };
      }
      if (path === "/me/messages/draft-1/send") return { post: sendPost };
      throw new Error(`Unexpected API path: ${path}`);
    });

    await sendEmailWithHtml(
      client,
      {
        to: "recipient@example.com",
        subject: "Subject",
        messageHtml: "<p>Hello</p>",
        attachments: [
          {
            filename: "large.pdf",
            content: Buffer.alloc(3 * 1024 * 1024 + 1),
            contentType: "application/pdf",
          },
        ],
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(createUploadSessionPost).toHaveBeenCalledWith(
      expect.objectContaining({
        AttachmentItem: expect.objectContaining({
          name: "large.pdf",
          size: 3 * 1024 * 1024 + 1,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalled();
    expect(sendPost).toHaveBeenCalledTimes(1);
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
