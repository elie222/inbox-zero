import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedEnv } = vi.hoisted(() => ({
  mockedEnv: {
    NODE_ENV: "production",
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
    AUTH_SECRET: "test-auth-secret",
    NEXTAUTH_SECRET: undefined as string | undefined,
    EMAIL_ENCRYPT_SECRET: "test-email-encrypt-secret",
  },
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/redis", () => ({
  redis: {
    eval: vi.fn(),
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
    vi.mocked(redis.eval).mockResolvedValue(2);

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
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      ["rate-limit:test"],
      ["60"],
    );
  });

  it("increments and expires a counter window atomically", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    await checkRateLimit({
      rule: {
        key: "rate-limit:test",
        limit: 3,
        windowSeconds: 60,
      },
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("EXPIRE", KEYS[1]'),
      ["rate-limit:test"],
      ["60"],
    );
  });

  it("blocks requests over the limit", async () => {
    vi.mocked(redis.eval).mockResolvedValue(4);

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
    vi.mocked(redis.eval).mockRejectedValue(new Error("redis down"));

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
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("builds safe key strings and extracts forwarded IPs", () => {
    expect(createRateLimitKey(["rate limit", "book/link", "a:b"])).toBe(
      "rate_limit:book_link:a_b",
    );
    // Rightmost entry wins: leftmost is client-controlled on Vercel.
    expect(
      getClientIp(
        new Headers({
          "x-forwarded-for": "203.0.113.1, 10.0.0.1",
        }),
      ),
    ).toBe("10.0.0.1");
    // Provider-specific visitor IP headers are not trusted by default because
    // they can be spoofed when the origin is directly reachable.
    expect(
      getClientIp(
        new Headers({
          "cf-connecting-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.1, 10.0.0.1",
        }),
      ),
    ).toBe("10.0.0.1");
    expect(
      getClientIp(
        new Headers({
          "cf-connecting-ip": "198.51.100.7",
        }),
      ),
    ).toBe("unknown");
    // x-real-ip is no longer trusted.
    expect(
      getClientIp(
        new Headers({
          "x-real-ip": "203.0.113.99",
        }),
      ),
    ).toBe("unknown");
  });
});
