import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  isSafeForSharedCache,
  type PublicContactContext,
} from "@/utils/ai/public-contact-context-schema";
import {
  getCachedPublicContactContext,
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
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("public contact context cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("removes cached values containing fields outside the public schema", async () => {
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
    expect(redis.del).toHaveBeenCalledOnce();
  });

  it("removes schema-valid cached values that fail the shared-cache sanitizer", async () => {
    vi.mocked(redis.get).mockResolvedValue({
      status: "found",
      context: getContext({
        sources: [
          {
            title: "Private contact private@example.com",
            url: "https://acme.com/team",
          },
        ],
      }),
    });

    await expect(
      getCachedPublicContactContext("john@acme.com"),
    ).resolves.toBeNull();
    expect(redis.del).toHaveBeenCalledOnce();
  });

  it("refuses generated text that contains an email address", async () => {
    const unsafe = getContext({
      professionalSummary: "Contact John at private@example.com.",
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await setCachedPublicContactContext("john@acme.com", unsafe);

    expect(redis.set).not.toHaveBeenCalled();
  });

  it("refuses non-web source URLs", async () => {
    const unsafe = getContext({
      sources: [{ title: "Local file", url: "file:///tmp/profile.txt" }],
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await setCachedPublicContactContext("john@acme.com", unsafe);

    expect(redis.set).not.toHaveBeenCalled();
  });

  it("refuses private-network source URLs", async () => {
    const unsafe = getContext({
      sources: [
        { title: "Internal profile", url: "http://192.168.1.10/profile" },
      ],
    });

    expect(isSafeForSharedCache(unsafe)).toBe(false);
    await setCachedPublicContactContext("john@acme.com", unsafe);

    expect(redis.set).not.toHaveBeenCalled();
  });

  it("stores only the strict public value for 30 days", async () => {
    const context = getContext();

    await setCachedPublicContactContext("john@acme.com", context);

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^public-contact-context:v1:[a-f0-9]{64}$/),
      { status: "found", context },
      { ex: 2_592_000 },
    );
  });

  it("stores a generic not-found result for 12 hours", async () => {
    await setCachedPublicContactContextNotFound("john@acme.com");

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^public-contact-context:v1:[a-f0-9]{64}$/),
      { status: "not_found" },
      { ex: 43_200 },
    );
  });
});

function getContext(
  overrides: Partial<PublicContactContext> = {},
): PublicContactContext {
  return {
    name: "John Smith",
    role: "Founder and CEO",
    professionalSummary: "Founder of Acme, a workflow software company.",
    highlights: ["Previously built products at Example Corp"],
    company: {
      name: "Acme",
      domain: "acme.com",
      website: "https://acme.com",
      description: "Workflow software for growing teams.",
      industry: "Software",
      employeeCount: "Approximately 30 employees",
      funding: "$50M raised",
      headquarters: "New York, New York",
    },
    sources: [{ title: "Acme team", url: "https://acme.com/team" }],
    confidence: "high",
    ...overrides,
  };
}
