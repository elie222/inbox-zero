import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { sendNotificationEmail } from "./send-notification-email";

const { createEmailProvider, env, sendEmailWithHtml } = vi.hoisted(() => ({
  createEmailProvider: vi.fn(),
  env: {
    AXIOM_TOKEN: undefined,
    ENABLE_DEBUG_LOGS: false,
    NEXT_PUBLIC_LOG_SCOPES: undefined,
    NODE_ENV: "test",
    RESEND_API_KEY: undefined as string | undefined,
    TRANSACTIONAL_EMAIL_PROVIDER: undefined as "resend" | "ses" | undefined,
  },
  sendEmailWithHtml: vi.fn(),
}));

vi.mock("@/env", () => ({ env }));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider }));

describe("sendNotificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.RESEND_API_KEY = undefined;
    env.TRANSACTIONAL_EMAIL_PROVIDER = undefined;
    createEmailProvider.mockResolvedValue({ sendEmailWithHtml });
  });

  it("uses the transactional email callback when SES is selected", async () => {
    env.TRANSACTIONAL_EMAIL_PROVIDER = "ses";
    const sendViaTransactionalEmail = vi.fn().mockResolvedValue(undefined);

    await sendNotificationEmail({
      emailAccountId: "email-account-1",
      logger: createScopedLogger("send-notification-email-test"),
      provider: "google",
      renderHtml: vi.fn(),
      sendViaTransactionalEmail,
      subject: "Subject",
      userEmail: "user@example.test",
    });

    expect(sendViaTransactionalEmail).toHaveBeenCalledOnce();
    expect(createEmailProvider).not.toHaveBeenCalled();
  });
});
