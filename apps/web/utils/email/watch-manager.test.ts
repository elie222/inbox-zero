import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import { createEmailProvider } from "@/utils/email/provider";
import { captureException } from "@/utils/error";
import { ensureEmailAccountsWatched } from "./watch-manager";

vi.mock("@/utils/prisma");

vi.mock("@/utils/auth/cleanup-invalid-tokens", () => ({
  cleanupInvalidTokens: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
  isInvalidGrantError: (error: unknown) =>
    error instanceof Error && error.message.includes("invalid_grant"),
}));

vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));

vi.mock("@/utils/premium", () => ({
  getPremiumUserFilter: vi.fn(() => ({})),
  getUserTier: vi.fn(() => "PRO"),
  hasAiAccess: vi.fn(() => true),
  premiumEntitlementSelect: {},
}));

const logger = createTestLogger();

describe("ensureEmailAccountsWatched", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cleans up invalid tokens when watch setup reports a detailed invalid_grant error", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      {
        id: "email-account-id",
        email: "account@example.com",
        watchEmailsExpirationDate: new Date(Date.now() + 3_600_000),
        watchEmailsSubscriptionId: null,
        account: {
          provider: "google",
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: Date.now() + 3_600_000,
          disconnectedAt: null,
        },
        user: {
          id: "user-id",
          aiApiKey: null,
          premium: null,
        },
      },
    ] as any);

    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      watchEmails: vi
        .fn()
        .mockRejectedValue(
          new Error("invalid_grant: token has been expired or revoked"),
        ),
    } as any);

    const results = await ensureEmailAccountsWatched({
      userIds: null,
      logger,
    });

    expect(cleanupInvalidTokens).toHaveBeenCalledTimes(1);
    expect(cleanupInvalidTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        reason: "invalid_grant",
      }),
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        emailAccountId: "email-account-id",
        status: "error",
        message: "Failed to set up watch for this account.",
        errorDetails: "invalid_grant: token has been expired or revoked",
      },
    ]);
  });
});
