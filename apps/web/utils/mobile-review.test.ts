vi.mock("server-only", () => ({}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockAuthContext, mockMakeSignature, mockRedis } = vi.hoisted(() => ({
  mockAuthContext: {
    authCookies: {
      sessionToken: {
        name: "__Secure-better-auth.session_token",
        attributes: {
          domain: "example.com",
          httpOnly: true,
          maxAge: 60 * 60,
          path: "/",
          sameSite: "lax" as const,
          secure: true,
        },
      },
    },
    internalAdapter: {
      createSession: vi.fn(),
    },
    secret: "test-secret",
  },
  mockMakeSignature: vi.fn(),
  mockRedis: {
    del: vi.fn(),
    incr: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: {
    APP_REVIEW_DEMO_ENABLED: true,
    APP_REVIEW_DEMO_CODE: "review-code",
    APP_REVIEW_DEMO_EMAIL: "demo@example.com",
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "redis-token",
  },
}));

vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    $context: Promise.resolve(mockAuthContext),
  },
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({
  redis: mockRedis,
}));
vi.mock("better-auth/crypto", () => ({
  makeSignature: mockMakeSignature,
}));

describe("createMobileReviewSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      emailAccounts: [{ id: "account-1" }],
    } as never);
    mockAuthContext.internalAdapter.createSession.mockResolvedValue({
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      token: "session-token",
    });
    mockMakeSignature.mockResolvedValue("cookie-signature");
    mockRedis.set.mockResolvedValue("OK");
  });

  it("creates a signed Better Auth session cookie", async () => {
    const { createMobileReviewSession } = await import("./mobile-review");

    const result = await createMobileReviewSession({
      code: "review-code",
      ipAddress: "203.0.113.10",
      userAgent: "Inbox Zero Mobile",
    });

    expect(mockAuthContext.internalAdapter.createSession).toHaveBeenCalledWith(
      "user-1",
      false,
      {
        ipAddress: "203.0.113.10",
        userAgent: "Inbox Zero Mobile",
      },
    );
    expect(mockMakeSignature).toHaveBeenCalledWith(
      "session-token",
      "test-secret",
    );
    expect(result).toEqual({
      emailAccountId: "account-1",
      sessionCookie: {
        name: "__Secure-better-auth.session_token",
        options: {
          domain: "example.com",
          expires: new Date("2026-05-01T00:00:00.000Z"),
          httpOnly: true,
          maxAge: 60 * 60,
          partitioned: undefined,
          path: "/",
          sameSite: "lax",
          secure: true,
        },
        value: "session-token.cookie-signature",
      },
      userId: "user-1",
    });
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
  });

  it("blocks excessive attempts before checking the code", async () => {
    mockRedis.set.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(6);

    const { createMobileReviewSession } = await import("./mobile-review");

    await expect(
      createMobileReviewSession({
        code: "wrong-code",
        ipAddress: "203.0.113.11",
        userAgent: "Inbox Zero Mobile",
      }),
    ).rejects.toMatchObject({
      safeMessage: "Too many review access attempts. Please try again later.",
      statusCode: 429,
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(
      mockAuthContext.internalAdapter.createSession,
    ).not.toHaveBeenCalled();
  });
});
