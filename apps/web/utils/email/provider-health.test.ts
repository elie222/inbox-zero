import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import {
  classifyEmailAccountProviderIssue,
  recordEmailAccountProviderIssue,
} from "@/utils/email/provider-health";

vi.mock("@/utils/auth/cleanup-invalid-tokens", () => ({
  cleanupInvalidTokens: vi.fn(),
}));

describe("provider health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cleanupInvalidTokens).mockResolvedValue(undefined);
  });

  it("records missing refresh token failures as reconnect-required issues", async () => {
    const logger = createMockLogger();

    await recordEmailAccountProviderIssue({
      emailAccountId: "email-account-1",
      provider: "google",
      error: new Error("No refresh token"),
      logger,
      operation: "createEmailProvider",
    });

    expect(cleanupInvalidTokens).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      reason: "invalid_grant",
      logger,
    });
  });

  it("records insufficient Gmail permissions as action-required issues", async () => {
    const logger = createMockLogger();

    await recordEmailAccountProviderIssue({
      emailAccountId: "email-account-1",
      provider: "google",
      error: new Error("Request had insufficient authentication scopes."),
      logger,
      operation: "getLabels",
    });

    expect(cleanupInvalidTokens).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      reason: "insufficient_permissions",
      logger,
    });
  });

  it("records Google policy blocks as action-required issues", () => {
    expect(
      classifyEmailAccountProviderIssue({
        provider: "google",
        error: new Error("policy_enforced"),
      }),
    ).toEqual({ reason: "policy_enforced" });
  });

  it("records unavailable Gmail service as action-required issues", () => {
    expect(
      classifyEmailAccountProviderIssue({
        provider: "google",
        error: new Error("Mail service not enabled"),
      }),
    ).toEqual({ reason: "mail_service_not_enabled" });
  });

  it("ignores transient Outlook throttling failures", async () => {
    const logger = createMockLogger();

    await recordEmailAccountProviderIssue({
      emailAccountId: "email-account-1",
      provider: "microsoft",
      error: new Error("Application is over its MailboxConcurrency limit."),
      logger,
      operation: "getMessage",
    });

    expect(cleanupInvalidTokens).not.toHaveBeenCalled();
  });

  it("ignores Outlook item-not-found failures", () => {
    expect(
      classifyEmailAccountProviderIssue({
        provider: "microsoft",
        error: new Error("The specified object was not found in the store."),
      }),
    ).toBeNull();
  });
});

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    with: vi.fn(),
    flush: vi.fn(),
  } as any;
}
