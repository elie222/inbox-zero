import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import { getEmailProviderRateLimitStateFromRedis } from "@/utils/redis/email-provider-rate-limit";

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    del: vi.fn(),
  },
}));

describe("email provider rate-limit redis state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads state automatically deserialized by the Redis client", async () => {
    const retryAt = new Date(Date.now() + 60_000);
    vi.mocked(redis.get).mockResolvedValue({
      provider: "google",
      retryAt: retryAt.toISOString(),
      source: "gmail-provider/get-messages",
      detectedAt: new Date().toISOString(),
    } as never);

    await expect(
      getEmailProviderRateLimitStateFromRedis({
        emailAccountId: "email-account-1",
      }),
    ).resolves.toEqual({
      provider: "google",
      retryAt,
      source: "gmail-provider/get-messages",
    });
    expect(redis.del).not.toHaveBeenCalled();
  });
});
