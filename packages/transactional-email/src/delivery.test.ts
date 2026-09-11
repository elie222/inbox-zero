import { beforeEach, describe, expect, it, vi } from "vitest";

const { createProvider, send } = vi.hoisted(() => ({
  createProvider: vi.fn(),
  send: vi.fn(),
}));

vi.mock("./providers/resend", () => ({
  createResendTransactionalEmailProvider: createProvider,
}));

describe("transactional email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    createProvider.mockReturnValue({ send });
  });

  it("reports when no provider is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { deliverTransactionalEmail, isTransactionalEmailConfigured } =
      await import("./delivery");

    expect(isTransactionalEmailConfigured()).toBe(false);
    await expect(
      deliverTransactionalEmail({
        from: "sender@example.test",
        html: "<p>Hello</p>",
        subject: "Subject",
        text: "Hello",
        to: "recipient@example.test",
      }),
    ).resolves.toBeNull();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("delivers through the configured provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "api_key");
    send.mockResolvedValue({ messageId: "message_1" });
    const { deliverTransactionalEmail, isTransactionalEmailConfigured } =
      await import("./delivery");
    const message = {
      from: "sender@example.test",
      html: "<p>Hello</p>",
      subject: "Subject",
      text: "Hello",
      to: "recipient@example.test",
    };

    expect(isTransactionalEmailConfigured()).toBe(true);
    await expect(
      deliverTransactionalEmail(message, { idempotencyKey: "delivery_1" }),
    ).resolves.toEqual({ messageId: "message_1" });
    expect(createProvider).toHaveBeenCalledWith("api_key");
    expect(send).toHaveBeenCalledWith(message, {
      idempotencyKey: "delivery_1",
    });
  });
});
