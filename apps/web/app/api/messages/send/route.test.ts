import { NextRequest } from "next/server";
import { EMAIL_ATTACHMENT_LIMITS } from "@inboxzero/email-editor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DURABLE_MULTIPART_EMAIL_SEND_LIMITS } from "@/utils/email/durable-email-send.validation";
import { EMAIL_SEND_LIMITS } from "@/utils/types/mail";
import { POST } from "./route";

const executeDurableEmailSend = vi.hoisted(() => vi.fn());
const executeStagedDurableEmailSend = vi.hoisted(() => vi.fn());
const findEmailAccount = vi.hoisted(() => vi.fn());
const createEmailProvider = vi.hoisted(() => vi.fn());
const emailProvider = vi.hoisted(() => ({
  name: "google" as const,
  sendEmailWithHtml: vi.fn(),
}));

type MockedRequest = NextRequest & {
  auth: { emailAccountId: string; userId: string };
  logger: { error: () => void };
};

vi.mock("@/utils/email/durable-email-send", () => ({
  executeDurableEmailSend,
}));
vi.mock("@/utils/email/email-attachment-staging", () => ({
  executeStagedDurableEmailSend,
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider,
}));
vi.mock("@/utils/prisma", () => ({
  default: { emailAccount: { findUnique: findEmailAccount } },
}));

vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (_name: string, handler: (request: MockedRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "account-1", userId: "user-1" },
          logger: { error: vi.fn() },
        }) as MockedRequest,
      ),
}));

describe("POST /api/messages/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEmailProvider.mockResolvedValue(emailProvider);
    findEmailAccount.mockResolvedValue({ account: { provider: "google" } });
    executeDurableEmailSend.mockResolvedValue({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
    executeStagedDurableEmailSend.mockResolvedValue({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
  });

  it("scopes the provider lookup to the authenticated account owner", async () => {
    emailProvider.sendEmailWithHtml.mockResolvedValue({
      messageId: "message-1",
      threadId: "thread-1",
    });

    await post({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hello</p>",
    });

    expect(findEmailAccount).toHaveBeenCalledWith({
      where: { id: "account-1", userId: "user-1" },
      select: { account: { select: { provider: true } } },
    });
  });

  it("keeps accepting the legacy direct-send payload", async () => {
    emailProvider.sendEmailWithHtml.mockResolvedValue({
      messageId: "message-1",
      threadId: "thread-1",
    });

    const response = await post({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hello</p>",
    });

    await expect(response.json()).resolves.toEqual({
      success: true,
      messageId: "message-1",
      threadId: "thread-1",
    });
    expect(emailProvider.sendEmailWithHtml).toHaveBeenCalledOnce();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("routes mutation-wrapped sends through the durable operation", async () => {
    const input = {
      mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
      queuedAt: 1_788_000_000_000,
      threadId: "thread-1",
      messageIds: ["message-1"],
      email: {
        to: "recipient@example.com",
        subject: "Re: Hello",
        messageHtml: "<p>Reply</p>",
      },
    };

    const response = await post(input);

    await expect(response.json()).resolves.toEqual({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
    expect(executeDurableEmailSend).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      getEmailProvider: expect.any(Function),
      input,
      provider: "google",
    });
    await expect(
      executeDurableEmailSend.mock.calls[0][0].getEmailProvider(),
    ).resolves.toBe(emailProvider);
    expect(emailProvider.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("does not treat an invalid mutation wrapper as a legacy payload", async () => {
    await expect(
      post({
        mutationId: "not-a-uuid",
        to: "recipient@example.com",
        subject: "Hello",
        messageHtml: "<p>Hello</p>",
      }),
    ).rejects.toThrow();
    expect(emailProvider.sendEmailWithHtml).not.toHaveBeenCalled();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("routes opaque staged attachment references through lazy materialization", async () => {
    const input = {
      ...durableInput([]),
      email: {
        ...durableInput([]).email,
        attachments: [
          {
            ...attachmentMetadata(),
            stagedAttachmentId: "cm1234567890abcdefghijklm",
          },
        ],
      },
    };

    const response = await post(input);

    await expect(response.json()).resolves.toMatchObject({ status: "applied" });
    expect(executeStagedDurableEmailSend).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      getEmailProvider: expect.any(Function),
      input,
      provider: "google",
    });
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("rejects staged aggregate limits before any DB or Blob work", async () => {
    const input = durableInput([]);
    input.email.attachments = Array.from({ length: 11 }, (_, index) => ({
      ...attachmentMetadata({ id: `attachment-${index}` }),
      stagedAttachmentId: `stage-${index}`,
    }));

    await expect(post(input)).rejects.toThrow("Attach at most 10 files.");
    expect(executeStagedDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects durable sends without a message to reconcile", async () => {
    await expect(
      post({
        mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
        queuedAt: 1_788_000_000_000,
        threadId: "thread-1",
        messageIds: [],
        email: {
          to: "recipient@example.com",
          subject: "Re: Hello",
          messageHtml: "<p>Reply</p>",
        },
      }),
    ).rejects.toThrow();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("assembles multipart attachments before the durable send", async () => {
    const input = durableInput([
      {
        id: "attachment-1",
        filename: "notes.txt",
        mimeType: "text/plain",
        size: 5,
        disposition: "attachment",
      },
    ]);

    const response = await postMultipart(input, [
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    ]);

    await expect(response.json()).resolves.toEqual({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
    expect(executeDurableEmailSend).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      getEmailProvider: expect.any(Function),
      input: {
        ...input,
        email: {
          ...input.email,
          attachments: [
            {
              id: "attachment-1",
              filename: "notes.txt",
              contentType: "text/plain",
              content: "aGVsbG8=",
              size: 5,
              disposition: "attachment",
            },
          ],
        },
      },
      provider: "google",
    });
    expect(emailProvider.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("preserves validated inline attachment metadata", async () => {
    const png = Buffer.from(PNG_BASE64, "base64");
    const input = durableInput([
      {
        id: "inline-1",
        filename: "pixel.png",
        mimeType: "image/png",
        size: png.byteLength,
        disposition: "inline",
        contentId: "pixel@example",
      },
    ]);

    await postMultipart(input, [
      new File([png], "pixel.png", { type: "image/png" }),
    ]);

    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          email: expect.objectContaining({
            attachments: [
              expect.objectContaining({
                content: PNG_BASE64,
                contentId: "pixel@example",
                disposition: "inline",
              }),
            ],
          }),
        }),
      }),
    );
  });

  it("accepts case-insensitive multipart media types", async () => {
    const input = durableInput([]);
    const encoded = new Request("http://localhost/api/messages/send", {
      method: "POST",
      body: multipartForm(input, []),
    });
    const contentType = encoded.headers
      .get("content-type")
      ?.replace("multipart/form-data", "Multipart/Form-Data ");

    const response = await POST(
      new NextRequest("http://localhost/api/messages/send", {
        method: "POST",
        body: await encoded.arrayBuffer(),
        headers: { "content-type": String(contentType) },
      }),
      { params: Promise.resolve({}) },
    );

    await expect(response.json()).resolves.toEqual({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
  });

  it.each([
    {
      name: "a missing file",
      metadata: [attachmentMetadata()],
      files: [],
    },
    {
      name: "an extra file",
      metadata: [],
      files: [textFile()],
    },
    {
      name: "a file in the wrong order",
      metadata: [
        attachmentMetadata({ filename: "first.txt" }),
        attachmentMetadata({ id: "attachment-2", filename: "second.txt" }),
      ],
      files: [
        new File(["hello"], "second.txt", { type: "text/plain" }),
        new File(["hello"], "first.txt", { type: "text/plain" }),
      ],
    },
    {
      name: "a mismatched size",
      metadata: [attachmentMetadata({ size: 4 })],
      files: [textFile()],
    },
    {
      name: "a mismatched MIME type",
      metadata: [attachmentMetadata({ mimeType: "application/pdf" })],
      files: [textFile()],
    },
  ])("rejects multipart sends with $name", async ({ metadata, files }) => {
    await expect(
      postMultipart(durableInput(metadata), files),
    ).rejects.toThrow();

    expect(executeDurableEmailSend).not.toHaveBeenCalled();
    expect(emailProvider.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("rejects invalid inline metadata before sending", async () => {
    const input = durableInput([
      attachmentMetadata({
        mimeType: "image/png",
        disposition: "inline",
        contentId: "unsafe content id",
      }),
    ]);

    await expect(
      postMultipart(input, [
        new File(["hello"], "notes.txt", { type: "image/png" }),
      ]),
    ).rejects.toThrow("Inline images require a valid Content-ID.");
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects spoofed inline image bytes before sending", async () => {
    const input = durableInput([
      attachmentMetadata({
        mimeType: "image/png",
        disposition: "inline",
        contentId: "pixel@example",
      }),
    ]);

    await expect(
      postMultipart(input, [
        new File(["hello"], "notes.txt", { type: "image/png" }),
      ]),
    ).rejects.toThrow("Inline image content does not match its file type.");
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "embedded content",
      overrides: { content: "aGVsbG8=" },
    },
    {
      name: "an invalid disposition",
      overrides: { disposition: "preview" },
    },
    {
      name: "an invalid MIME type",
      overrides: { mimeType: "not-a-mime-type" },
    },
  ])("rejects multipart metadata with $name", async ({ overrides }) => {
    await expect(
      postMultipart(durableInput([attachmentMetadata(overrides)]), [
        textFile(),
      ]),
    ).rejects.toThrow();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects multipart attachments over the shared total limit", async () => {
    const size = Math.floor(EMAIL_ATTACHMENT_LIMITS.maxTotalBytes / 2) + 1;
    const input = durableInput([
      attachmentMetadata({ filename: "first.bin", size }),
      attachmentMetadata({ id: "attachment-2", filename: "second.bin", size }),
    ]);

    await expect(postMultipart(input, [])).rejects.toThrow(
      "Attachments must total 15 MB or less.",
    );
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects an oversized multipart file before sending", async () => {
    const size = EMAIL_ATTACHMENT_LIMITS.maxFileBytes + 1;
    const input = durableInput([attachmentMetadata({ size })]);

    await expect(
      postMultipart(input, [
        new File([new Uint8Array(size)], "notes.txt", { type: "text/plain" }),
      ]),
    ).rejects.toThrow("Attachments must be 10 MB or smaller.");
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects multipart requests whose declared request size is too large", async () => {
    const formData = multipartForm(durableInput([]), []);

    await expect(
      POST(
        new NextRequest("http://localhost/api/messages/send", {
          method: "POST",
          body: formData,
          headers: { "content-length": String(25 * 1024 * 1024 + 1) },
        }),
        { params: Promise.resolve({}) },
      ),
    ).rejects.toThrow();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("bounds and cancels an oversized multipart body without Content-Length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(EMAIL_SEND_LIMITS.maxSerializedPayloadBytes + 1),
        );
      },
      cancel,
    });
    const request = new NextRequest("http://localhost/api/messages/send", {
      method: "POST",
      body,
      duplex: "half",
      headers: {
        "content-type": "multipart/form-data; boundary=attachment-boundary",
      },
    } satisfies RequestInit & { duplex: "half" });

    await expect(
      POST(request, { params: Promise.resolve({}) }),
    ).rejects.toThrow("The multipart request is too large.");
    expect(cancel).toHaveBeenCalledOnce();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("bounds the multipart payload form field even without Content-Length", async () => {
    const input = durableInput([]);
    input.email.to = "a".repeat(
      DURABLE_MULTIPART_EMAIL_SEND_LIMITS.maxPayloadBytes + 1,
    );

    await expect(postMultipart(input, [])).rejects.toThrow();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });
});

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/messages/send", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
}

function postMultipart(payload: unknown, files: File[]) {
  return POST(
    new NextRequest("http://localhost/api/messages/send", {
      method: "POST",
      body: multipartForm(payload, files),
    }),
    { params: Promise.resolve({}) },
  );
}

function multipartForm(payload: unknown, files: File[]) {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));
  for (const file of files) formData.append("attachment", file);
  return formData;
}

function durableInput(attachments: Record<string, unknown>[]) {
  return {
    mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
    queuedAt: 1_788_000_000_000,
    threadId: "thread-1",
    messageIds: ["message-1"],
    email: {
      to: "recipient@example.com",
      subject: "Re: Hello",
      messageHtml: '<p>Reply<img src="cid:pixel@example"></p>',
      attachments,
    },
  };
}

function attachmentMetadata(overrides: Record<string, unknown> = {}) {
  return {
    id: "attachment-1",
    filename: "notes.txt",
    mimeType: "text/plain",
    size: 5,
    disposition: "attachment",
    ...overrides,
  };
}

function textFile() {
  return new File(["hello"], "notes.txt", { type: "text/plain" });
}
