import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import { claimOAuthCode } from "@/utils/redis/oauth-code";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_TOKEN: "token",
    UPSTASH_REDIS_URL: "https://redis.example.com",
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
  },
}));

describe("claimOAuthCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("atomically claims an unused code", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await expect(
      claimOAuthCode("oauth-code", "request-fingerprint"),
    ).resolves.toBeNull();

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth-code:/),
      {
        requestFingerprint: "request-fingerprint",
        status: "processing",
      },
      {
        ex: 600,
        get: true,
        nx: true,
      },
    );
  });

  it("reports an in-flight callback", async () => {
    const processing = {
      requestFingerprint: "request-fingerprint",
      status: "processing" as const,
    };
    vi.mocked(redis.set).mockResolvedValue(processing);

    await expect(claimOAuthCode("oauth-code")).resolves.toBe(processing);
  });

  it("normalizes a legacy string lock as an in-flight callback", async () => {
    vi.mocked(redis.set).mockResolvedValue("processing");

    await expect(claimOAuthCode("oauth-code")).resolves.toEqual({
      status: "processing",
    });
  });

  it("returns a completed callback result", async () => {
    const completed = {
      params: { redirect: "https://example.com/welcome-redirect" },
      status: "success" as const,
    };
    vi.mocked(redis.set).mockResolvedValue(completed);

    await expect(claimOAuthCode("oauth-code")).resolves.toBe(completed);
  });
});
