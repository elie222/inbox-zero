import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResendTransactionalEmailProvider } from "./resend";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

describe("Resend transactional email provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a provider-neutral message to Resend", async () => {
    mockSend.mockResolvedValue({
      data: { id: "message_1" },
      error: null,
    });
    const provider = createResendTransactionalEmailProvider("api_key");

    const result = await provider.send(
      {
        attachments: [
          { filename: "invoice.pdf", path: "https://example.test" },
        ],
        from: "sender@example.test",
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

    expect(mockSend).toHaveBeenCalledWith(
      {
        attachments: [
          { filename: "invoice.pdf", path: "https://example.test" },
        ],
        from: "sender@example.test",
        headers: { "X-Entity-Ref-ID": "entity_1" },
        html: "<p>Hello</p>",
        replyTo: "reply@example.test",
        subject: "Subject",
        tags: [{ name: "category", value: "test" }],
        text: "Hello",
        to: "delivered@resend.dev",
      },
      { idempotencyKey: "test-id" },
    );
    expect(result).toEqual({ messageId: "message_1" });
  });

  it("throws provider errors", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "Rejected" },
    });
    const provider = createResendTransactionalEmailProvider("api_key");

    await expect(
      provider.send({
        from: "sender@example.test",
        html: "<p>Hello</p>",
        subject: "Subject",
        text: "Hello",
        to: "recipient@example.test",
      }),
    ).rejects.toThrow("Error sending email: Rejected");
  });
});
