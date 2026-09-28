import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import { createEmailProvider } from "@/utils/email/provider";
import { captureException } from "@/utils/error";
import { clearWatchLapsedErrorIfResolved } from "@/utils/error-messages";
import { fetchGoogleOpenIdProfile } from "@/utils/google/oauth";
import { ensureEmailAccountsWatched } from "./watch-manager";

vi.mock("@/utils/prisma");

vi.mock("@/utils/error-messages", () => ({
  clearWatchLapsedErrorIfResolved: vi.fn(),
}));

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

vi.mock("@/utils/google/oauth", () => ({
  fetchGoogleOpenIdProfile: vi.fn(),
}));

vi.mock("@/utils/redis/account-validation", () => ({
  invalidateAccountValidation: vi.fn(),
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
    vi.useRealTimers();
    vi.mocked(cleanupInvalidTokens).mockResolvedValue(undefined);
    vi.mocked(fetchGoogleOpenIdProfile).mockResolvedValue({
      email: "account@example.com",
      email_verified: true,
      hd: "example.com",
      sub: "google-subject",
    });
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
      getAccessToken: () => "access-token",
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

  it("clears the watch lapsed error after re-establishing a lapsed watch", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      getWatchedEmailAccount({
        watchEmailsExpirationDate: new Date(Date.now() - 3_600_000),
      }),
    ] as any);

    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getAccessToken: () => "access-token",
      watchEmails: vi.fn().mockResolvedValue({
        expirationDate: new Date(Date.now() + 3_600_000),
      }),
    } as any);

    const results = await ensureEmailAccountsWatched({
      userIds: null,
      logger,
    });

    expect(results).toEqual([
      expect.objectContaining({
        emailAccountId: "email-account-id",
        status: "success",
      }),
    ]);
    expect(clearWatchLapsedErrorIfResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-id",
        emailAccountId: "email-account-id",
      }),
    );
  });

  it("does not touch the watch lapsed error when the watch was already healthy", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      getWatchedEmailAccount({
        watchEmailsExpirationDate: new Date(Date.now() + 3_600_000),
      }),
    ] as any);

    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getAccessToken: () => "access-token",
      watchEmails: vi.fn().mockResolvedValue({
        expirationDate: new Date(Date.now() + 3_600_000),
      }),
    } as any);

    await ensureEmailAccountsWatched({ userIds: null, logger });

    expect(clearWatchLapsedErrorIfResolved).not.toHaveBeenCalled();
  });

  it("updates a renamed Google mailbox address once a day so webhooks keep matching", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      getWatchedEmailAccount({
        watchEmailsExpirationDate: new Date(Date.now() + 3_600_000),
      }),
    ] as any);
    vi.mocked(createEmailProvider).mockResolvedValue(getGoogleProvider());
    vi.mocked(fetchGoogleOpenIdProfile).mockResolvedValue({
      email: "renamed@example.org",
      email_verified: true,
      hd: "example.org",
      sub: "google-subject",
    });
    prisma.$transaction.mockResolvedValue([]);

    for (let hour = 0; hour < 24; hour++) {
      vi.useFakeTimers({ now: Date.UTC(2026, 0, 1, hour), toFake: ["Date"] });
      await ensureEmailAccountsWatched({ userIds: null, logger });
    }

    expect(fetchGoogleOpenIdProfile).toHaveBeenCalledTimes(1);
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "email-account-id",
          email: "account@example.com",
        }),
        data: expect.objectContaining({ email: "renamed@example.org" }),
      }),
    );
  });

  it("still renews the watch when the mailbox address check fails", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      getWatchedEmailAccount({
        watchEmailsExpirationDate: new Date(Date.now() + 3_600_000),
      }),
    ] as any);
    vi.mocked(createEmailProvider).mockResolvedValue(getGoogleProvider());
    vi.mocked(fetchGoogleOpenIdProfile).mockRejectedValue(
      new Error("Failed to fetch Google profile (500)"),
    );

    const results = [];
    for (let hour = 0; hour < 24; hour++) {
      vi.useFakeTimers({ now: Date.UTC(2026, 0, 1, hour), toFake: ["Date"] });
      results.push(
        ...(await ensureEmailAccountsWatched({ userIds: null, logger })),
      );
    }

    expect(fetchGoogleOpenIdProfile).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(24);
    expect(results.every((result) => result.status === "success")).toBe(true);
  });
});

function getGoogleProvider() {
  return {
    name: "google",
    getAccessToken: () => "access-token",
    watchEmails: vi.fn().mockResolvedValue({
      expirationDate: new Date(Date.now() + 3_600_000),
    }),
  } as any;
}

function getWatchedEmailAccount({
  watchEmailsExpirationDate,
}: {
  watchEmailsExpirationDate: Date;
}) {
  return {
    id: "email-account-id",
    email: "account@example.com",
    userId: "user-id",
    accountId: "account-id",
    watchEmailsExpirationDate,
    watchEmailsSubscriptionId: null,
    account: {
      provider: "google",
      providerAccountId: "google-subject",
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: Date.now() + 3_600_000,
      disconnectedAt: null,
    },
    user: {
      id: "user-id",
      email: "owner@example.com",
      aiApiKey: null,
      premium: null,
    },
  };
}
