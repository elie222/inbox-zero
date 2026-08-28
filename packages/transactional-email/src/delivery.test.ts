import { beforeEach, describe, expect, it, vi } from "vitest";

const { createResendProvider, createSesProvider, send } = vi.hoisted(() => ({
  createResendProvider: vi.fn(),
  createSesProvider: vi.fn(),
  send: vi.fn(),
}));

vi.mock("./providers/resend", () => ({
  createResendTransactionalEmailProvider: createResendProvider,
}));

vi.mock("./providers/ses", () => ({
  createSesTransactionalEmailProvider: createSesProvider,
}));

describe("transactional email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    createResendProvider.mockReturnValue({ send });
    createSesProvider.mockReturnValue({ send });
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
    expect(createResendProvider).not.toHaveBeenCalled();
    expect(createSesProvider).not.toHaveBeenCalled();
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
    expect(createResendProvider).toHaveBeenCalledWith("api_key");
    expect(send).toHaveBeenCalledWith(message, {
      idempotencyKey: "delivery_1",
    });
  });

  it("delivers through SES when selected", async () => {
    vi.stubEnv("TRANSACTIONAL_EMAIL_PROVIDER", "ses");
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
    await expect(deliverTransactionalEmail(message)).resolves.toEqual({
      messageId: "message_1",
    });
    expect(createSesProvider).toHaveBeenCalledOnce();
    expect(createResendProvider).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(message, undefined);
  });

  it("requires a Resend API key when Resend is explicitly selected", async () => {
    vi.stubEnv("TRANSACTIONAL_EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    const { isTransactionalEmailConfigured } = await import("./delivery");

    expect(isTransactionalEmailConfigured()).toBe(false);
    expect(createResendProvider).not.toHaveBeenCalled();
    expect(createSesProvider).not.toHaveBeenCalled();
  });
});
