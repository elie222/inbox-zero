import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
  getMobileReviewAccessStatus,
} from "./mobile-review";

function createLogger() {
  const logger = {
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    with: vi.fn(),
  };

  logger.with.mockReturnValue(logger);

  return logger;
}

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

  it("reports disabled status when the configured review account has no email account", async () => {
    const logger = createLogger();
    emailAccountFindManyMock.mockResolvedValueOnce([]);

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: false });
    expect(logger.warn).toHaveBeenCalledWith(
      "Mobile review access unavailable",
      expect.objectContaining({
        count: 1,
        reasons: [
          expect.objectContaining({
            hasEmailAccount: false,
            ok: false,
            reason: "review_user_missing_email_account",
          }),
        ],
      }),
    );
  });

  it("reports enabled status when the configured review account is usable", async () => {
    const logger = createLogger();
    emailAccountFindManyMock.mockResolvedValueOnce([
      {
        email: "review@example.com",
        id: "account-1",
        user: {
          email: "owner@example.com",
          id: "user-1",
        },
      },
    ]);

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reports disabled status when the review user lookup fails", async () => {
    const logger = createLogger();
    const error = new Error("database unavailable");
    emailAccountFindManyMock.mockRejectedValueOnce(error);

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: false });
    expect(logger.warn).toHaveBeenCalledWith(
      "Mobile review access unavailable",
      expect.objectContaining({
        error,
        reason: "review_user_lookup_failed",
      }),
    );
  });

  it("reports disabled status when review account config is invalid", async () => {
    const logger = createLogger();
    mockedEnv.APP_REVIEW_DEMO_ACCOUNTS = JSON.stringify([
      { email: "not-an-email", code: "review-code" },
    ]);

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: false });
    expect(emailAccountFindManyMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Mobile review access unavailable",
      expect.objectContaining({
        hasReviewDemoAccounts: false,
        reason: "review_demo_misconfigured",
      }),
    );
  });

  it("reports disabled status when any configured review account is missing", async () => {
    const logger = createLogger();
    mockedEnv.APP_REVIEW_DEMO_ACCOUNTS = JSON.stringify([
      { email: "active-review@example.com", code: "active-code" },
      { email: "expired-review@example.com", code: "expired-code" },
    ]);
    emailAccountFindManyMock.mockResolvedValueOnce([
      {
        email: "active-review@example.com",
        id: "account-active",
        user: {
          email: "active-owner@example.com",
          id: "user-active",
        },
      },
    ]);

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: false });
    expect(logger.warn).toHaveBeenCalledWith(
      "Mobile review access unavailable",
      expect.objectContaining({
        count: 1,
        reasons: [
          expect.objectContaining({
            hasEmailAccount: false,
            ok: false,
            reason: "review_user_missing_email_account",
          }),
        ],
      }),
    );
  });

  it("rejects invalid review codes before querying the database", async () => {
    const logger = createLogger();

    await expect(
      createMobileReviewSession({
        code: "wrong-code",
        email: "review@example.com",
        logger,
      } as never),
    ).rejects.toMatchObject({
      message: "Invalid review access code",
      safeMessage: "Invalid review access code",
      statusCode: 401,
    });

    expect(emailAccountFindManyMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Mobile review sign-in rejected", {
      reason: "invalid_review_demo_code",
    });
  });

  it("rejects valid review codes when the configured review account cannot create a session", async () => {
    const logger = createLogger();
    emailAccountFindManyMock.mockResolvedValueOnce([]);

    await expect(
      createMobileReviewSession({
        code: "review-code",
        email: "review@example.com",
        logger,
      } as never),
    ).rejects.toMatchObject({
      message: "Review access is unavailable",
      safeMessage: "Review access is unavailable",
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "Mobile review sign-in unavailable",
      expect.objectContaining({
        hasEmailAccount: false,
        ok: false,
        reason: "review_user_missing_email_account",
      }),
    );
  });

  it("creates a session for the matching configured review account", async () => {
    const logger = createLogger();
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
