import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  isSafeForSharedCache,
  type PublicContactContext,
  publicContactContextSchema,
} from "@/utils/ai/public-contact-context-schema";
import {
  getCachedPublicContactContext,
  type PublicContactContextCacheEntry,
  setCachedPublicContactContext,
  setCachedPublicContactContextNotFound,
} from "@/utils/redis/public-contact-context-cache";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
    EMAIL_ENCRYPT_SALT: "test-hmac-salt",
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    del: vi.fn(),
    eval: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("public contact context cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.eval).mockResolvedValue(1);
  });

  it("shares a valid entry through a hashed key without storing the email", async () => {
    const context = getContext();
    vi.mocked(redis.get).mockResolvedValue({ status: "found", context });

    await expect(
      getCachedPublicContactContext("John@Acme.com"),
    ).resolves.toEqual({ status: "found", context });

    const key = vi.mocked(redis.get).mock.calls[0]?.[0];
    expect(key).toMatch(/^public-contact-context:v1:[a-f0-9]{64}$/);
    expect(key).not.toContain("john");
    expect(key).not.toContain("acme.com");
  });

  it("ignores cached values containing fields outside the public schema", async () => {
    vi.mocked(redis.get).mockResolvedValue({
      status: "found",
      context: {
        ...getContext(),
        contactedByUserIds: ["user-123"],
      },
    });

    await expect(
      getCachedPublicContactContext("john@acme.com"),
    ).resolves.toBeNull();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("ignores schema-valid cached values that fail the shared-cache sanitizer", async () => {
    vi.mocked(redis.get).mockResolvedValue({
      status: "found",
      context: getContext({
        sources: [{ url: "https://acme.com/team?email=private@example.com" }],
      }),
    });

    await expect(
      getCachedPublicContactContext("john@acme.com"),
    ).resolves.toBeNull();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("refuses generated text that contains an email address", async () => {
    const context = getContext();
    const unsafe = getContext({
      company: {
        ...context.company!,
        description: "Contact John at private@example.com.",
      },
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await expect(
      setCachedPublicContactContext("john@acme.com", unsafe, "lock-token"),
    ).resolves.toBe(false);

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("refuses non-web source URLs", async () => {
    const unsafe = getContext({
      sources: [{ url: "file:///tmp/profile.txt" }],
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await expect(
      setCachedPublicContactContext("john@acme.com", unsafe, "lock-token"),
    ).resolves.toBe(false);

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("refuses private-network source URLs", async () => {
    const unsafe = getContext({
      sources: [{ url: "http://192.168.1.10/profile" }],
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await expect(
      setCachedPublicContactContext("john@acme.com", unsafe, "lock-token"),
    ).resolves.toBe(false);

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("refuses sensitive data embedded in public URLs", async () => {
    const unsafe = getContext({
      sources: [{ url: "https://acme.com/team?api_key=abcdefghijklmnop" }],
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await expect(
      setCachedPublicContactContext("john@acme.com", unsafe, "lock-token"),
    ).resolves.toBe(false);

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("does not cache a found result after losing the research lock", async () => {
    vi.mocked(redis.eval).mockResolvedValue(0);

    await expect(
      setCachedPublicContactContext(
        "john@acme.com",
        getContext(),
        "expired-lock-token",
      ),
    ).resolves.toBe(false);

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenCalledOnce();
  });

  it("does not cache a not-found result after losing the research lock", async () => {
    vi.mocked(redis.eval).mockResolvedValue(0);

    await expect(
      setCachedPublicContactContextNotFound(
        "john@acme.com",
        "expired-lock-token",
      ),
    ).resolves.toBe(false);

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenCalledOnce();
  });

  it("stores only the strict public value for 30 days", async () => {
    const context = getContext();

    await expect(
      setCachedPublicContactContext("john@acme.com", context, "lock-token"),
    ).resolves.toBe(true);

    expectCacheWrite({ status: "found", context }, 2_592_000, "lock-token");
  });

  it("has no field for person-level free-form private details", () => {
    expect(
      publicContactContextSchema.safeParse({
        ...getContext(),
        professionalSummary: "Family and home address details",
      }).success,
    ).toBe(false);
  });

  it("stores a generic not-found result for 12 hours", async () => {
    await expect(
      setCachedPublicContactContextNotFound("john@acme.com", "lock-token"),
    ).resolves.toBe(true);

    expectCacheWrite({ status: "not_found" }, 43_200, "lock-token");
  });
});

function expectCacheWrite(
  entry: PublicContactContextCacheEntry,
  ttlSeconds: number,
  lockToken: string,
) {
  expect(redis.eval).toHaveBeenCalledWith(
    expect.stringContaining('redis.call("SET", KEYS[2]'),
    [
      expect.stringMatching(/^public-contact-context:v1:lock:[a-f0-9]{64}$/),
      expect.stringMatching(/^public-contact-context:v1:[a-f0-9]{64}$/),
    ],
    [lockToken, JSON.stringify(entry), ttlSeconds.toString()],
  );
}

function getContext(
  overrides: Partial<PublicContactContext> = {},
): PublicContactContext {
  return {
    name: "John Smith",
    role: "Founder and CEO",
    company: {
      name: "Acme",
      domain: "acme.com",
      website: "https://acme.com",
      description: "Workflow software for growing teams.",
      industry: "Software",
      employeeCount: "Approximately 30 employees",
      funding: "$50M raised",
    },
    sources: [{ url: "https://acme.com/team" }],
    confidence: "high",
    ...overrides,
  };
}
