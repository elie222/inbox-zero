import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { reconcileAllEmailInboxes } from "@/utils/email/reconcile-inbox";
import { processHistoryForUser as processGoogleHistoryForUser } from "@/app/api/google/webhook/process-history";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getGmailCurrentHistoryId } from "@/utils/gmail/profile";
import {
  backfillRecentOutlookMessages,
  getOutlookReconcileStartDate,
} from "@/utils/outlook/backfill-recent-messages";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";
import prisma from "@/utils/prisma";

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/app/api/google/webhook/process-history", () => ({
  processHistoryForUser: vi.fn(),
}));

vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: vi.fn(),
}));

vi.mock("@/utils/gmail/profile", () => ({
  getGmailCurrentHistoryId: vi.fn(),
}));

vi.mock("@/utils/outlook/backfill-recent-messages", () => ({
  backfillRecentOutlookMessages: vi.fn(),
  getOutlookReconcileStartDate: vi.fn(),
  OUTLOOK_RECONCILE_MAX_MESSAGES: 100,
}));

vi.mock("@/utils/email/rate-limit", () => ({
  getEmailProviderRateLimitState: vi.fn(),
}));

vi.mock("@/utils/premium", () => ({
  getPremiumUserFilter: vi.fn(() => ({})),
  getUserTier: vi.fn(() => "PRO"),
  hasAiAccess: vi.fn(() => true),
  premiumEntitlementSelect: {},
}));

describe("reconcileAllEmailInboxes", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailProviderRateLimitState).mockResolvedValue(null);
    vi.mocked(getGmailClientWithRefresh).mockResolvedValue({} as any);
  });

  it("skips Gmail accounts that are already synced", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      {
        id: "gmail-account",
        email: "user@gmail.com",
        lastSyncedHistoryId: "2000",
        watchEmailsSubscriptionId: null,
        account: {
          provider: "google",
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: Date.now() + 60_000,
        },
        user: {
          aiApiKey: "ai-key",
          premium: null,
        },
      },
    ] as any);
    vi.mocked(getGmailCurrentHistoryId).mockResolvedValue(2000);

    const result = await reconcileAllEmailInboxes({ logger });

    expect(result.accountCount).toBe(1);
    expect(result.results).toEqual([
      {
        emailAccountId: "gmail-account",
        email: "user@gmail.com",
        provider: "google",
        status: "skipped",
        reason: "already_synced",
        currentHistoryId: 2000,
        lastSyncedHistoryId: "2000",
      },
    ]);
    expect(processGoogleHistoryForUser).not.toHaveBeenCalled();
  });

  it("reconciles Gmail accounts when history is behind", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      {
        id: "gmail-account",
        email: "user@gmail.com",
        lastSyncedHistoryId: "1000",
        watchEmailsSubscriptionId: null,
        account: {
          provider: "google",
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: Date.now() + 60_000,
        },
        user: {
          aiApiKey: "ai-key",
          premium: null,
        },
      },
    ] as any);
    vi.mocked(getGmailCurrentHistoryId).mockResolvedValue(2500);

    const result = await reconcileAllEmailInboxes({ logger });

    expect(processGoogleHistoryForUser).toHaveBeenCalledWith(
      {
        emailAddress: "user@gmail.com",
        historyId: 2500,
      },
      {},
      expect.anything(),
    );
    expect(result.results).toEqual([
      {
        emailAccountId: "gmail-account",
        email: "user@gmail.com",
        provider: "google",
        status: "success",
        currentHistoryId: 2500,
        lastSyncedHistoryId: "1000",
      },
    ]);
  });

  it("reconciles Outlook accounts via recent message backfill", async () => {
    const after = new Date("2026-04-15T00:00:00.000Z");
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      {
        id: "outlook-account",
        email: "user@outlook.com",
        lastSyncedHistoryId: null,
        watchEmailsSubscriptionId: "subscription-id",
        account: {
          provider: "microsoft",
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: Date.now() + 60_000,
        },
        user: {
          aiApiKey: "ai-key",
          premium: null,
        },
      },
    ] as any);
    vi.mocked(getOutlookReconcileStartDate).mockResolvedValue(after);
    vi.mocked(backfillRecentOutlookMessages).mockResolvedValue({
      processedCount: 2,
      candidateCount: 3,
    });

    const result = await reconcileAllEmailInboxes({ logger });

    expect(getOutlookReconcileStartDate).toHaveBeenCalledWith(
      "outlook-account",
    );
    expect(backfillRecentOutlookMessages).toHaveBeenCalledWith({
      emailAccountId: "outlook-account",
      emailAddress: "user@outlook.com",
      subscriptionId: "subscription-id",
      after,
      maxMessages: 100,
      logger: expect.anything(),
    });
    expect(result.results).toEqual([
      {
        emailAccountId: "outlook-account",
        email: "user@outlook.com",
        provider: "microsoft",
        status: "success",
        processedCount: 2,
        candidateCount: 3,
      },
    ]);
  });
});
