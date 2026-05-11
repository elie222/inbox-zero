import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const {
  createSessionMock,
  emailAccountFindManyMock,
  makeSignatureMock,
  mockedEnv,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  emailAccountFindManyMock: vi.fn(),
  makeSignatureMock: vi.fn(),
  mockedEnv: {
    APP_REVIEW_DEMO_ACCOUNTS: undefined as string | undefined,
    APP_REVIEW_DEMO_ENABLED: true,
  },
}));

vi.mock("better-auth/crypto", () => ({
  makeSignature: (...args: unknown[]) => makeSignatureMock(...args),
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    $context: Promise.resolve({
      authCookies: {
        sessionToken: {
          attributes: {
            domain: undefined,
            httpOnly: true,
            maxAge: undefined,
            partitioned: false,
            path: "/",
            sameSite: "lax",
            secure: true,
          },
          name: "__Secure-better-auth.session_token",
        },
      },
      internalAdapter: {
        createSession: (...args: unknown[]) => createSessionMock(...args),
      },
      secret: "test-secret",
    }),
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findMany: (...args: unknown[]) => emailAccountFindManyMock(...args),
    },
  },
}));

import {
  createMobileReviewSession,
  isMobileReviewEnabled,
} from "./mobile-review";

describe("mobile review access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnv.APP_REVIEW_DEMO_ENABLED = true;
    mockedEnv.APP_REVIEW_DEMO_ACCOUNTS = JSON.stringify([
      { email: "review@example.com", code: "review-code" },
    ]);
    makeSignatureMock.mockResolvedValue("signed-token");
    createSessionMock.mockResolvedValue({
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      token: "session-token",
    });
  });

  it("reports enabled status from the env flag without validating accounts", () => {
    mockedEnv.APP_REVIEW_DEMO_ACCOUNTS = "not-json";

    expect(isMobileReviewEnabled()).toBe(true);
    expect(emailAccountFindManyMock).not.toHaveBeenCalled();
  });

  it("reports disabled status when the env flag is off", () => {
    mockedEnv.APP_REVIEW_DEMO_ENABLED = false;

    expect(isMobileReviewEnabled()).toBe(false);
    expect(emailAccountFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects invalid review codes before querying the database", async () => {
    await expect(
      createMobileReviewSession({
        code: "wrong-code",
        email: "review@example.com",
        logger: createTestLogger(),
      } as never),
    ).rejects.toMatchObject({
      message: "Invalid review access code",
      safeMessage: "Invalid review access code",
      statusCode: 401,
    });

    expect(emailAccountFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects valid review codes when the configured review account cannot create a session", async () => {
    emailAccountFindManyMock.mockResolvedValueOnce([]);

    await expect(
      createMobileReviewSession({
        code: "review-code",
        email: "review@example.com",
        logger: createTestLogger(),
      } as never),
    ).rejects.toMatchObject({
      message: "Review access is unavailable",
      safeMessage: "Review access is unavailable",
    });
  });

  it("creates a session for the matching configured review account", async () => {
    const logger = createTestLogger();
    mockedEnv.APP_REVIEW_DEMO_ACCOUNTS = JSON.stringify([
      { email: "active-review@example.com", code: "active-code" },
      { email: "expired-review@example.com", code: "expired-code" },
    ]);
    emailAccountFindManyMock.mockResolvedValueOnce([
      {
        email: "expired-review@example.com",
        id: "account-expired",
        user: {
          email: "expired-owner@example.com",
          id: "user-expired",
        },
      },
    ]);

    const result = await createMobileReviewSession({
      code: "expired-code",
      email: "Expired-Review@Example.com",
      logger,
    } as never);

    expect(emailAccountFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: {
            in: ["expired-review@example.com"],
          },
        },
      }),
    );
    expect(createSessionMock).toHaveBeenCalledWith("user-expired", false, {});
    expect(result).toMatchObject({
      emailAccountId: "account-expired",
      userEmail: "expired-owner@example.com",
      userId: "user-expired",
    });
  });
});
