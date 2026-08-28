import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSesTransactionalEmailProvider } from "./ses";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  SendEmailCommand: class {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  SESv2Client: class {
    send = mockSend;
  },
}));

describe("SES transactional email provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps a provider-neutral message to SES", async () => {
    mockSend.mockResolvedValue({ MessageId: "message_1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );
    const provider = createSesTransactionalEmailProvider();

    const result = await provider.send(
      {
        attachments: [
          {
            filename: "invoice.pdf",
            path: "https://example.test/invoice.pdf",
          },
          {
            content: Buffer.from("logo").toString("base64"),
            contentId: "logo",
            contentType: "image/png",
            filename: "logo.png",
          },
        ],
        from: "Sender <sender@example.test>",
        headers: { "X-Entity-Ref-ID": "entity_1" },
        html: "<p>Hello</p>",
        replyTo: "reply@example.test",
        subject: "Subject",
        tags: [{ name: "category", value: "test" }],
        text: "Hello",
        to: "recipient@example.test",
      },
      { idempotencyKey: "test-id", test: true },
    );

    expect(fetch).toHaveBeenCalledWith("https://example.test/invoice.pdf");
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0]?.[0].input).toEqual({
      Content: {
        Simple: {
          Attachments: [
            {
              ContentDisposition: "ATTACHMENT",
              FileName: "invoice.pdf",
              RawContent: new Uint8Array([1, 2, 3]),
            },
            {
              ContentDisposition: "INLINE",
              ContentId: "logo",
              ContentType: "image/png",
              FileName: "logo.png",
              RawContent: Buffer.from("logo"),
            },
          ],
          Body: {
            Html: { Charset: "UTF-8", Data: "<p>Hello</p>" },
            Text: { Charset: "UTF-8", Data: "Hello" },
          },
          Headers: [{ Name: "X-Entity-Ref-ID", Value: "entity_1" }],
          Subject: { Charset: "UTF-8", Data: "Subject" },
        },
      },
      Destination: {
        ToAddresses: ["success@simulator.amazonses.com"],
      },
      EmailTags: [{ Name: "category", Value: "test" }],
      FromEmailAddress: "Sender <sender@example.test>",
      ReplyToAddresses: ["reply@example.test"],
    });
    expect(result).toEqual({ messageId: "message_1" });
  });

  it("throws when a remote attachment cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    const provider = createSesTransactionalEmailProvider();

    await expect(
      provider.send({
        attachments: [
          {
            filename: "invoice.pdf",
            path: "https://example.test/invoice.pdf",
          },
        ],
        from: "sender@example.test",
        html: "<p>Hello</p>",
        subject: "Subject",
        text: "Hello",
        to: "recipient@example.test",
      }),
    ).rejects.toThrow("Failed to fetch email attachment: 404");
    expect(mockSend).not.toHaveBeenCalled();
  });
});
