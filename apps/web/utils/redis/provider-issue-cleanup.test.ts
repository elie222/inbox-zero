import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  claimProviderIssueCleanupInRedis,
  releaseProviderIssueCleanupClaimInRedis,
} from "@/utils/redis/provider-issue-cleanup";

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    del: vi.fn(),
  },
}));

describe("provider issue cleanup redis throttle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims provider issue cleanup with a short-lived key", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    const claimed = await claimProviderIssueCleanupInRedis({
      emailAccountId: "email-account-1",
      reason: "invalid_grant",
    });

    expect(claimed).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      "provider-issue-cleanup:email-account-1:invalid_grant",
      "1",
      { ex: 900, nx: true },
    );
  });

  it("returns false when provider issue cleanup was already claimed", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    const claimed = await claimProviderIssueCleanupInRedis({
      emailAccountId: "email-account-1",
      reason: "invalid_grant",
    });

    expect(claimed).toBe(false);
  });

  it("releases provider issue cleanup claims", async () => {
    vi.mocked(redis.del).mockResolvedValue(1);

    await releaseProviderIssueCleanupClaimInRedis({
      emailAccountId: "email-account-1",
      reason: "invalid_grant",
    });

    expect(redis.del).toHaveBeenCalledWith(
      "provider-issue-cleanup:email-account-1:invalid_grant",
    );
  });
});
