import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  claimOAuthCode,
  claimOAuthCodeAndWait,
  setOAuthCodeResult,
} from "@/utils/redis/oauth-code";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_TOKEN: "token",
    UPSTASH_REDIS_URL: "https://redis.example.com",
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("claimOAuthCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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

describe("claimOAuthCodeAndWait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("claims an unused code without polling", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await expect(claimOAuthCodeAndWait("oauth-code")).resolves.toEqual({
      status: "claimed",
    });

    expect(redis.get).not.toHaveBeenCalled();
  });

  it("waits for an in-flight callback result", async () => {
    vi.useFakeTimers();
    vi.mocked(redis.set).mockResolvedValue({ status: "processing" });
    vi.mocked(redis.get).mockResolvedValue({
      params: { connected: "notion" },
      status: "success",
    });

    const resultPromise = claimOAuthCodeAndWait("oauth-code");
    await vi.advanceTimersByTimeAsync(250);

    await expect(resultPromise).resolves.toEqual({
      result: {
        params: { connected: "notion" },
        status: "success",
      },
      status: "success",
      waited: true,
    });
  });

  it("reports which Redis stage failed", async () => {
    const error = new Error("Redis unavailable");
    vi.mocked(redis.set).mockRejectedValue(error);

    await expect(claimOAuthCodeAndWait("oauth-code")).resolves.toEqual({
      error,
      stage: "claim",
      status: "error",
    });
  });

  it("continues polling after a transient Redis wait failure", async () => {
    vi.useFakeTimers();
    vi.mocked(redis.set).mockResolvedValue({ status: "processing" });
    vi.mocked(redis.get)
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce({
        params: { connected: "notion" },
        status: "success",
      });

    const resultPromise = claimOAuthCodeAndWait("oauth-code");
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).resolves.toEqual({
      result: {
        params: { connected: "notion" },
        status: "success",
      },
      status: "success",
      waited: true,
    });
  });

  it("reports a Redis failure after the full wait window", async () => {
    vi.useFakeTimers();
    const error = new Error("Redis unavailable");
    vi.mocked(redis.set).mockResolvedValue({ status: "processing" });
    vi.mocked(redis.get).mockRejectedValue(error);

    const resultPromise = claimOAuthCodeAndWait("oauth-code");
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(resultPromise).resolves.toEqual({
      error,
      stage: "wait",
      status: "error",
    });
    expect(redis.get).toHaveBeenCalledTimes(60);
  });

  it("times out when another callback does not publish a result", async () => {
    vi.useFakeTimers();
    vi.mocked(redis.set).mockResolvedValue({ status: "processing" });
    vi.mocked(redis.get).mockResolvedValue(null);

    const resultPromise = claimOAuthCodeAndWait("oauth-code");
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(resultPromise).resolves.toEqual({ status: "timeout" });
    expect(redis.get).toHaveBeenCalledTimes(60);
  });
});

describe("setOAuthCodeResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries transient result publication failures", async () => {
    vi.useFakeTimers();
    vi.mocked(redis.set)
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce("OK");

    const resultPromise = setOAuthCodeResult("oauth-code", {
      connected: "notion",
    });
    await vi.advanceTimersByTimeAsync(250);

    await expect(resultPromise).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledTimes(2);
  });
});
