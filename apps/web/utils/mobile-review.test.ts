vi.mock("server-only", () => ({}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockAuthContext, mockMakeSignature } = vi.hoisted(() => ({
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
vi.mock("better-auth/crypto", () => ({
  makeSignature: mockMakeSignature,
}));

describe("createMobileReviewSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      email: "demo@example.com",
      id: "user-1",
      emailAccounts: [{ id: "account-1" }],
    } as never);
    mockAuthContext.internalAdapter.createSession.mockResolvedValue({
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      token: "session-token",
    });
    mockMakeSignature.mockResolvedValue("cookie-signature");
  });

  it("creates a signed Better Auth session cookie", async () => {
    const { createMobileReviewSession } = await import("./mobile-review");

    const result = await createMobileReviewSession({
      code: "review-code",
    });

    expect(mockAuthContext.internalAdapter.createSession).toHaveBeenCalledWith(
      "user-1",
      false,
      {},
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
      userEmail: "demo@example.com",
      userId: "user-1",
    });
  });
});
