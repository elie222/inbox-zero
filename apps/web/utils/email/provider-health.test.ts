import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import {
  classifyEmailAccountProviderIssue,
  recordEmailAccountProviderIssue,
} from "@/utils/email/provider-health";
import {
  claimProviderIssueCleanupInRedis,
  releaseProviderIssueCleanupClaimInRedis,
} from "@/utils/redis/provider-issue-cleanup";

vi.mock("@/utils/auth/cleanup-invalid-tokens", () => ({
  cleanupInvalidTokens: vi.fn(),
}));

vi.mock("@/utils/redis/provider-issue-cleanup", () => ({
  claimProviderIssueCleanupInRedis: vi.fn(),
  releaseProviderIssueCleanupClaimInRedis: vi.fn(),
}));

describe("provider health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cleanupInvalidTokens).mockResolvedValue(undefined);
    vi.mocked(claimProviderIssueCleanupInRedis).mockResolvedValue(true);
    vi.mocked(releaseProviderIssueCleanupClaimInRedis).mockResolvedValue(
      undefined,
    );
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
    expect(claimProviderIssueCleanupInRedis).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      reason: "invalid_grant",
    });
  });

  it("ignores invalid access token failures from provider operations", async () => {
    const logger = createMockLogger();

    await recordEmailAccountProviderIssue({
      emailAccountId: "email-account-1",
      provider: "google",
      error: new Error("Invalid access token"),
      logger,
      operation: "getThreadsWithLabel",
    });

    expect(cleanupInvalidTokens).not.toHaveBeenCalled();
    expect(claimProviderIssueCleanupInRedis).not.toHaveBeenCalled();
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

  it("skips cleanup when provider issue cleanup was recently claimed", async () => {
    const logger = createMockLogger();
    vi.mocked(claimProviderIssueCleanupInRedis).mockResolvedValueOnce(false);

    await recordEmailAccountProviderIssue({
      emailAccountId: "email-account-1",
      provider: "google",
      error: new Error("No refresh token"),
      logger,
      operation: "createEmailProvider",
    });

    expect(cleanupInvalidTokens).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Skipping duplicate provider issue cleanup",
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
        operation: "createEmailProvider",
        reason: "invalid_grant",
      }),
    );
  });

  it("falls back to cleanup when Redis claim fails", async () => {
    const logger = createMockLogger();
    vi.mocked(claimProviderIssueCleanupInRedis).mockRejectedValueOnce(
      new Error("redis unavailable"),
    );

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
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to claim provider issue cleanup",
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
        operation: "createEmailProvider",
        reason: "invalid_grant",
        error: expect.any(Error),
      }),
    );
  });

  it("records Outlook access denied as action-required permission issues", async () => {
    const logger = createMockLogger();

    await recordEmailAccountProviderIssue({
      emailAccountId: "email-account-1",
      provider: "microsoft",
      error: new Error("Access is denied. Check credentials and try again."),
      logger,
      operation: "getMessage",
    });

    expect(cleanupInvalidTokens).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      reason: "insufficient_permissions",
      logger,
    });
  });

  it("keeps provider error handling alive when cleanup fails", async () => {
    const logger = createMockLogger();
    vi.mocked(cleanupInvalidTokens).mockRejectedValueOnce(
      new Error("cleanup failed"),
    );

    await expect(
      recordEmailAccountProviderIssue({
        emailAccountId: "email-account-1",
        provider: "google",
        error: new Error("No refresh token"),
        logger,
        operation: "createEmailProvider",
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to clean up provider account issue",
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
        operation: "createEmailProvider",
        reason: "invalid_grant",
        error: expect.any(Error),
      }),
    );
    expect(releaseProviderIssueCleanupClaimInRedis).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      reason: "invalid_grant",
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
