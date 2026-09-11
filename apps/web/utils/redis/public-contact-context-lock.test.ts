import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  acquirePublicContactResearchLock,
  releasePublicContactResearchLock,
} from "@/utils/redis/public-contact-context-lock";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
    EMAIL_ENCRYPT_SALT: "test-hmac-salt",
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    eval: vi.fn(),
    set: vi.fn(),
  },
}));

describe("public contact research lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acquires a short-lived lock using only an HMAC identity", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    await expect(
      acquirePublicContactResearchLock("John@Acme.com"),
    ).resolves.toEqual({
      status: "acquired",
      lockToken: expect.any(String),
    });

    const key = vi.mocked(redis.set).mock.calls[0]?.[0];
    expect(key).toMatch(/^public-contact-context:v1:lock:[a-f0-9]{64}$/);
    expect(key).not.toContain("john");
    expect(key).not.toContain("acme.com");
    expect(redis.set).toHaveBeenCalledWith(key, expect.any(String), {
      ex: 120,
      nx: true,
    });
  });

  it("reports busy when another worker owns the lock", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await expect(
      acquirePublicContactResearchLock("john@acme.com"),
    ).resolves.toEqual({ status: "busy" });
  });

  it("reports unavailable when Redis cannot acquire a lock", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("Redis unavailable"));

    await expect(
      acquirePublicContactResearchLock("john@acme.com"),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("releases only the lock owned by the worker", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    await releasePublicContactResearchLock("john@acme.com", "lock-token");

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("DEL", KEYS[1])'),
      [expect.stringMatching(/^public-contact-context:v1:lock:[a-f0-9]{64}$/)],
      ["lock-token"],
    );
  });
});
