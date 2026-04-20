import type { Message } from "@microsoft/microsoft-graph-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { forwardEmail, sendEmailWithHtml } from "./mail";

vi.mock("@/utils/mail", () => ({
  ensureEmailSendingEnabled: vi.fn(),
}));

vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn(async () => undefined),
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

  it("keeps plain text attachment strings as utf-8", async () => {
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

    const plainTextContent = "hello world";

    await sendEmailWithHtml(
      client,
      {
        to: "recipient@example.com",
        subject: "Subject",
        messageHtml: "<p>Hello</p>",
        attachments: [
          {
            filename: "notes.txt",
            content: plainTextContent,
            contentType: "text/plain",
          },
        ],
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(attachmentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        contentBytes: Buffer.from(plainTextContent, "utf8").toString("base64"),
      }),
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
  });

  it("keeps malformed base64 attachment strings as utf-8", async () => {
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

    const malformedBase64Content = "SGVsbG8*";

    await sendEmailWithHtml(
      client,
      {
        to: "recipient@example.com",
        subject: "Subject",
        messageHtml: "<p>Hello</p>",
        attachments: [
          {
            filename: "broken.txt",
            content: malformedBase64Content,
            contentType: "text/plain",
          },
        ],
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(attachmentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        contentBytes: Buffer.from(malformedBase64Content, "utf8").toString(
          "base64",
        ),
      }),
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
  });

  it("retries upload-session chunks and sends them as octet-stream", async () => {
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
    const totalSize = 3 * 1024 * 1024 + 1;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("temporary failure", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockImplementation(async (_url: string, init?: RequestInit) =>
        createUploadChunkProgressResponse(init),
      );
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
            content: Buffer.alloc(totalSize),
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
          size: totalSize,
        }),
      }),
    );
    const firstChunkRequest = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };
    const secondChunkRequest = fetchMock.mock.calls[1]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://upload.example.test/session",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/octet-stream",
        }),
      }),
    );
    expect(firstChunkRequest.headers?.["Content-Range"]).toBe(
      secondChunkRequest.headers?.["Content-Range"],
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
  });

  it("resumes upload-session progress after a retried chunk returns 416", async () => {
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
    const totalSize = 3 * 1024 * 1024 + 1;
    const chunkSize = 320 * 1024;
    let firstChunkAttempt = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response(
          JSON.stringify({
            nextExpectedRanges: [`${chunkSize}-${totalSize - 1}`],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const contentRange = getContentRangeHeader(init);
      if (contentRange === `bytes 0-${chunkSize - 1}/${totalSize}`) {
        if (firstChunkAttempt === 0) {
          firstChunkAttempt += 1;
          throw new TypeError("fetch failed");
        }

        if (firstChunkAttempt === 1) {
          firstChunkAttempt += 1;
          return new Response("already received", { status: 416 });
        }
      }

      const parsedRange = parseContentRange(contentRange);
      if (!parsedRange)
        throw new Error(`Unexpected content range: ${contentRange}`);

      if (parsedRange.endInclusive + 1 >= parsedRange.totalSize) {
        return new Response(null, { status: 201 });
      }

      return createUploadChunkProgressResponse(init);
    });
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
            filename: "resume.pdf",
            content: Buffer.alloc(totalSize),
            contentType: "application/pdf",
          },
        ],
      },
      createScopedLogger("outlook-mail-test"),
    );

    const statusCallIndex = fetchMock.mock.calls.findIndex(
      ([, init]) => init?.method === "GET",
    );
    expect(statusCallIndex).toBeGreaterThan(-1);
    const resumedPutCall = fetchMock.mock.calls
      .slice(statusCallIndex + 1)
      .find(([, init]) => init?.method === "PUT");
    expect(getContentRangeHeader(resumedPutCall?.[1])).toBe(
      `bytes ${chunkSize}-${chunkSize * 2 - 1}/${totalSize}`,
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
  });

  it("falls back to local chunk progress when upload-session status is unavailable", async () => {
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
    const totalSize = 3 * 1024 * 1024 + 1;
    const chunkSize = 320 * 1024;
    let firstChunkAttempt = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response("not supported", { status: 404 });
      }

      const contentRange = getContentRangeHeader(init);
      if (contentRange === `bytes 0-${chunkSize - 1}/${totalSize}`) {
        if (firstChunkAttempt === 0) {
          firstChunkAttempt += 1;
          throw new TypeError("fetch failed");
        }

        if (firstChunkAttempt === 1) {
          firstChunkAttempt += 1;
          return new Response("already received", { status: 416 });
        }
      }

      return createUploadChunkProgressResponse(init);
    });
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
            filename: "fallback.pdf",
            content: Buffer.alloc(totalSize),
            contentType: "application/pdf",
          },
        ],
      },
      createScopedLogger("outlook-mail-test"),
    );

    const statusCallIndex = fetchMock.mock.calls.findIndex(
      ([, init]) => init?.method === "GET",
    );
    expect(statusCallIndex).toBeGreaterThan(-1);
    const resumedPutCall = fetchMock.mock.calls
      .slice(statusCallIndex + 1)
      .find(([, init]) => init?.method === "PUT");
    expect(getContentRangeHeader(resumedPutCall?.[1])).toBe(
      `bytes ${chunkSize}-${chunkSize * 2 - 1}/${totalSize}`,
    );
    expect(sendPost).toHaveBeenCalledTimes(1);
  });

  it("surfaces unexpected upload-session status failures during 416 recovery", async () => {
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
    const totalSize = 3 * 1024 * 1024 + 1;
    const chunkSize = 320 * 1024;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response("unavailable", { status: 503 });
      }

      const contentRange = getContentRangeHeader(init);
      if (contentRange === `bytes 0-${chunkSize - 1}/${totalSize}`) {
        return new Response("already received", { status: 416 });
      }

      return createUploadChunkProgressResponse(init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMockOutlookClient((path) => {
      if (path === "/me/messages") return { post: draftPost };
      if (path === "/me/messages/draft-1/attachments/createUploadSession") {
        return { post: createUploadSessionPost };
      }
      if (path === "/me/messages/draft-1/send") return { post: sendPost };
      throw new Error(`Unexpected API path: ${path}`);
    });

    await expect(
      sendEmailWithHtml(
        client,
        {
          to: "recipient@example.com",
          subject: "Subject",
          messageHtml: "<p>Hello</p>",
          attachments: [
            {
              filename: "resume.pdf",
              content: Buffer.alloc(totalSize),
              contentType: "application/pdf",
            },
          ],
        },
        createScopedLogger("outlook-mail-test"),
      ),
    ).rejects.toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining(
          "Failed to fetch Outlook upload session status: 503",
        ),
      }),
    });

    expect(sendPost).not.toHaveBeenCalled();
  });
});

describe("forwardEmail", () => {
  it("creates a forward draft, applies the formatted sender, and sends it", async () => {
    const getMessage = vi.fn(async () => {
      return {
        id: "message-1",
        conversationId: "conversation-1",
        subject: "Original subject",
        bodyPreview: "Original preview",
        body: { content: "<p>Original body</p>" },
        from: {
          emailAddress: {
            address: "sender@example.com",
            name: "Sender Name",
          },
        },
        toRecipients: [
          {
            emailAddress: {
              address: "recipient@example.com",
              name: "Recipient Name",
            },
          },
        ],
        receivedDateTime: "2025-02-06T22:35:00.000Z",
      } as Message;
    });
    const createForwardDraft = vi.fn(async () => {
      return {
        id: "draft-1",
        conversationId: "conversation-1",
        from: {
          emailAddress: {
            address: "owner@example.com",
          },
        },
      } as Message;
    });
    const updateDraft = vi.fn(async () => ({}));
    const sendDraft = vi.fn(async () => ({}));

    const client = createMockOutlookClient((path) => {
      if (path === "/me/messages/message-1") return { get: getMessage };
      if (path === "/me/messages/message-1/createForward") {
        return { post: createForwardDraft };
      }
      if (path === "/me/messages/draft-1") return { patch: updateDraft };
      if (path === "/me/messages/draft-1/send") return { post: sendDraft };
      throw new Error(`Unexpected API path: ${path}`);
    });

    await forwardEmail(
      client,
      {
        messageId: "message-1",
        to: "Recipient Name <recipient@example.com>",
        cc: "CC Person <cc@example.com>",
        bcc: "bcc@example.com",
        content: "Forwarding this",
        from: "Owner Name <owner@example.com>",
      },
      createScopedLogger("outlook-mail-test"),
    );

    expect(createForwardDraft).toHaveBeenCalledWith({});
    expect(updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        toRecipients: [
          {
            emailAddress: {
              address: "recipient@example.com",
              name: "Recipient Name",
            },
          },
        ],
        ccRecipients: [
          {
            emailAddress: {
              address: "cc@example.com",
              name: "CC Person",
            },
          },
        ],
        bccRecipients: [
          {
            emailAddress: {
              address: "bcc@example.com",
            },
          },
        ],
        from: {
          emailAddress: {
            address: "owner@example.com",
            name: "Owner Name",
          },
        },
        subject: "Fwd: Original subject",
        body: expect.objectContaining({
          contentType: "html",
          content: expect.stringContaining("Forwarding this"),
        }),
      }),
    );
    expect(sendDraft).toHaveBeenCalledTimes(1);
  });
});

function createMockOutlookClient(
  getEndpoint: (path: string) => {
    get?: () => Promise<unknown>;
    post?: (body: unknown) => Promise<unknown>;
    patch?: (body: unknown) => Promise<unknown>;
  },
): OutlookClient {
  const api = vi.fn((path: string) => {
    const endpoint = getEndpoint(path);
    return {
      get: endpoint.get ?? vi.fn(async () => ({})),
      post: endpoint.post ?? vi.fn(async () => ({})),
      patch: endpoint.patch ?? vi.fn(async () => ({})),
    };
  });

  return {
    getClient: vi.fn(() => ({ api })),
  } as unknown as OutlookClient;
}

function getContentRangeHeader(init?: RequestInit) {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["Content-Range"] || "";
}

function parseContentRange(contentRange: string) {
  const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(contentRange);
  if (!match) return null;

  return {
    start: Number(match[1]),
    endInclusive: Number(match[2]),
    totalSize: Number(match[3]),
  };
}

function createUploadChunkProgressResponse(init?: RequestInit) {
  const contentRange = getContentRangeHeader(init);
  const parsedRange = parseContentRange(contentRange);
  if (!parsedRange)
    throw new Error(`Unexpected content range: ${contentRange}`);

  if (parsedRange.endInclusive + 1 >= parsedRange.totalSize) {
    return new Response(null, { status: 201 });
  }

  return new Response(
    JSON.stringify({
      nextExpectedRanges: [
        `${parsedRange.endInclusive + 1}-${parsedRange.totalSize - 1}`,
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
