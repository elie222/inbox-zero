import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createSessionMock,
  emailAccountFindUniqueMock,
  makeSignatureMock,
  mockedEnv,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  emailAccountFindUniqueMock: vi.fn(),
  makeSignatureMock: vi.fn(),
  mockedEnv: {
    APP_REVIEW_DEMO_CODE: "review-code",
    APP_REVIEW_DEMO_EMAIL: "review@example.com",
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
      findUnique: (...args: unknown[]) => emailAccountFindUniqueMock(...args),
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
    mockedEnv.APP_REVIEW_DEMO_CODE = "review-code";
    mockedEnv.APP_REVIEW_DEMO_EMAIL = "review@example.com";
    makeSignatureMock.mockResolvedValue("signed-token");
    createSessionMock.mockResolvedValue({
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      token: "session-token",
    });
  });

  it("reports disabled status when the configured review account has no email account", async () => {
    const logger = createLogger();
    emailAccountFindUniqueMock.mockResolvedValueOnce(null);

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: false });
    expect(logger.warn).toHaveBeenCalledWith(
      "Mobile review access unavailable",
      expect.objectContaining({
        hasEmailAccount: false,
        ok: false,
        reason: "review_user_missing_email_account",
      }),
    );
  });

  it("reports enabled status when the configured review account is usable", async () => {
    const logger = createLogger();
    emailAccountFindUniqueMock.mockResolvedValueOnce({
      email: "review@example.com",
      id: "account-1",
      user: {
        email: "owner@example.com",
        id: "user-1",
      },
    });

    const result = await getMobileReviewAccessStatus({ logger } as never);

    expect(result).toEqual({ enabled: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reports disabled status when the review user lookup fails", async () => {
    const logger = createLogger();
    const error = new Error("database unavailable");
    emailAccountFindUniqueMock.mockRejectedValueOnce(error);

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

  it("rejects invalid review codes before querying the database", async () => {
    const logger = createLogger();

    await expect(
      createMobileReviewSession({ code: "wrong-code", logger } as never),
    ).rejects.toMatchObject({
      message: "Invalid review access code",
      safeMessage: "Invalid review access code",
      statusCode: 401,
    });

    expect(emailAccountFindUniqueMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Mobile review sign-in rejected", {
      reason: "invalid_review_demo_code",
    });
  });

  it("rejects valid review codes when the configured review account cannot create a session", async () => {
    const logger = createLogger();
    emailAccountFindUniqueMock.mockResolvedValueOnce(null);

    await expect(
      createMobileReviewSession({ code: "review-code", logger } as never),
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
});
