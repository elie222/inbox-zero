import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedEnv } = vi.hoisted(() => ({
  mockedEnv: {
    NODE_ENV: "production",
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
  },
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/redis", () => ({
  redis: {
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

import { redis } from "@/utils/redis";
import {
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/utils/rate-limit";

describe("rate limit utilities", () => {
  beforeEach(() => {
    mockedEnv.NODE_ENV = "production";
    mockedEnv.UPSTASH_REDIS_URL = "https://redis.example.com";
    mockedEnv.UPSTASH_REDIS_TOKEN = "token";
    vi.clearAllMocks();
  });

  it("allows requests while the counter is under the limit", async () => {
    vi.mocked(redis.incr).mockResolvedValue(2);
    vi.mocked(redis.expire).mockResolvedValue(1);

    const result = await checkRateLimit({
      rule: {
        key: "rate-limit:test",
        limit: 3,
        windowSeconds: 60,
      },
    });

    expect(result).toEqual({
      limited: false,
      limit: 3,
      remaining: 1,
    });
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("expires a new counter window", async () => {
    vi.mocked(redis.incr).mockResolvedValue(1);
    vi.mocked(redis.expire).mockResolvedValue(1);

    await checkRateLimit({
      rule: {
        key: "rate-limit:test",
        limit: 3,
        windowSeconds: 60,
      },
    });

    expect(redis.expire).toHaveBeenCalledWith("rate-limit:test", 60);
  });

  it("blocks requests over the limit", async () => {
    vi.mocked(redis.incr).mockResolvedValue(4);

    const result = await checkRateLimit({
      rule: {
        key: "rate-limit:test",
        limit: 3,
        windowSeconds: 60,
      },
    });

    expect(result).toEqual({
      limited: true,
      limit: 3,
      retryAfterSeconds: 60,
    });
  });

  it("fails open when Redis is unavailable", async () => {
    vi.mocked(redis.incr).mockRejectedValue(new Error("redis down"));

    const result = await checkRateLimit({
      rule: {
        key: "rate-limit:test",
        limit: 3,
        windowSeconds: 60,
      },
    });

    expect(result).toEqual({
      limited: false,
      limit: 3,
      remaining: 3,
    });
  });

  it("disables Redis calls when Redis is not configured", async () => {
    mockedEnv.UPSTASH_REDIS_URL = undefined;
    mockedEnv.UPSTASH_REDIS_TOKEN = undefined;

    const result = await checkRateLimit({
      rule: {
        key: "rate-limit:test",
        limit: 3,
        windowSeconds: 60,
      },
    });

    expect(result.limited).toBe(false);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("builds safe key strings and extracts forwarded IPs", () => {
    expect(createRateLimitKey(["rate limit", "book/link", "a:b"])).toBe(
      "rate_limit:book_link:a_b",
    );
    expect(
      getClientIp(
        new Headers({
          "x-forwarded-for": "203.0.113.1, 10.0.0.1",
        }),
      ),
    ).toBe("203.0.113.1");
  });
});
