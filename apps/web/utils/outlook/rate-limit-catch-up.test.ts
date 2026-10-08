import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { backfillRecentOutlookMessages } from "@/utils/outlook/backfill-recent-messages";
import { catchUpAfterOutlookRateLimit } from "@/utils/outlook/rate-limit-catch-up";
import {
  markOutlookRateLimitCatchUp,
  takeOutlookRateLimitCatchUp,
} from "@/utils/redis/outlook-rate-limit-catch-up";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/outlook/backfill-recent-messages", () => ({
  backfillRecentOutlookMessages: vi.fn(),
}));
vi.mock("@/utils/redis/outlook-rate-limit-catch-up", () => ({
  markOutlookRateLimitCatchUp: vi.fn(),
  takeOutlookRateLimitCatchUp: vi.fn(),
}));

const logger = createTestLogger();
const emailAccount = {
  id: "account-1",
  email: "user@example.com",
  watchEmailsSubscriptionId: "subscription-1",
};
const since = new Date("2026-10-01T10:00:00.000Z");

describe("catchUpAfterOutlookRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no notifications were skipped", async () => {
    vi.mocked(takeOutlookRateLimitCatchUp).mockResolvedValue(null);

    await catchUpAfterOutlookRateLimit({ emailAccount, logger });

    expect(backfillRecentOutlookMessages).not.toHaveBeenCalled();
  });

  it("processes mail from just before the first skipped notification", async () => {
    vi.mocked(takeOutlookRateLimitCatchUp).mockResolvedValue(since);
    vi.mocked(backfillRecentOutlookMessages).mockResolvedValue({
      processedCount: 3,
      candidateCount: 3,
      rateLimited: false,
    });

    await catchUpAfterOutlookRateLimit({ emailAccount, logger });

    expect(backfillRecentOutlookMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        emailAddress: "user@example.com",
        subscriptionId: "subscription-1",
        after: new Date("2026-10-01T09:55:00.000Z"),
      }),
    );
    expect(markOutlookRateLimitCatchUp).not.toHaveBeenCalled();
  });

  it("keeps the window when the backfill stops on a new rate limit", async () => {
    vi.mocked(takeOutlookRateLimitCatchUp).mockResolvedValue(since);
    vi.mocked(backfillRecentOutlookMessages).mockResolvedValue({
      processedCount: 1,
      candidateCount: 5,
      rateLimited: true,
    });

    await catchUpAfterOutlookRateLimit({ emailAccount, logger });

    expect(markOutlookRateLimitCatchUp).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-1", since }),
    );
  });

  it("keeps the window when the account is rate limited before the backfill starts", async () => {
    vi.mocked(takeOutlookRateLimitCatchUp).mockResolvedValue(since);
    vi.mocked(backfillRecentOutlookMessages).mockRejectedValue(
      new ProviderRateLimitModeError({
        provider: "microsoft",
        retryAt: new Date(Date.now() + 60_000),
      }),
    );

    await catchUpAfterOutlookRateLimit({ emailAccount, logger });

    expect(markOutlookRateLimitCatchUp).toHaveBeenCalledWith(
      expect.objectContaining({ since }),
    );
  });

  it("does not retry forever after an unrelated failure", async () => {
    vi.mocked(takeOutlookRateLimitCatchUp).mockResolvedValue(since);
    vi.mocked(backfillRecentOutlookMessages).mockRejectedValue(
      new Error("Graph unavailable"),
    );

    await expect(
      catchUpAfterOutlookRateLimit({ emailAccount, logger }),
    ).resolves.toBeUndefined();
    expect(markOutlookRateLimitCatchUp).not.toHaveBeenCalled();
  });
});
