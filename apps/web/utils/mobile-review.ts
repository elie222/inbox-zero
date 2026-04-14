import { timingSafeEqual } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

type MobileReviewConfigResult =
  | {
      ok: true;
      reviewDemoCode: string;
      reviewDemoEmail: string;
    }
  | {
      ok: false;
      reason: "review_demo_disabled";
    }
  | {
      ok: false;
      hasReviewDemoCode: boolean;
      hasReviewDemoEmail: boolean;
      reason: "review_demo_misconfigured";
    };

type MobileReviewUserResult =
  | {
      ok: true;
      user: {
        email: string;
        emailAccountId: string;
        id: string;
      };
    }
  | {
      ok: false;
      hasUser: boolean;
      reason: "review_user_missing_email_account";
    };

export function isMobileReviewEnabled(): boolean {
  return Boolean(
    env.APP_REVIEW_DEMO_ENABLED &&
      env.APP_REVIEW_DEMO_CODE?.trim() &&
      env.APP_REVIEW_DEMO_EMAIL?.trim(),
  );
}

export async function getMobileReviewAccessStatus(input: { logger: Logger }) {
  const config = getMobileReviewConfig();
  if (!config.ok) {
    input.logger.warn("Mobile review access unavailable", {
      ...config,
      ok: undefined,
    });
    return { enabled: false as const };
  }

  const reviewUser = await getMobileReviewUser(config.reviewDemoEmail);
  if (!reviewUser.ok) {
    input.logger.warn("Mobile review access unavailable", reviewUser);
    return { enabled: false as const };
  }

  return { enabled: true as const };
}

export async function createMobileReviewSession(input: {
  code: string;
  logger: Logger;
}) {
  const config = getMobileReviewConfig();
  if (!config.ok) {
    input.logger.warn("Mobile review sign-in unavailable", {
      ...config,
      ok: undefined,
    });
    throw new SafeError("Review access is unavailable");
  }

  if (!codesMatch(input.code, config.reviewDemoCode)) {
    input.logger.warn("Mobile review sign-in rejected", {
      reason: "invalid_review_demo_code",
    });
    throw new SafeError("Invalid review access code", 401);
  }

  const reviewUser = await getMobileReviewUser(config.reviewDemoEmail);
  if (!reviewUser.ok) {
    input.logger.warn("Mobile review sign-in unavailable", reviewUser);
    throw new SafeError("Review access is unavailable");
  }

  const authContext = await betterAuthConfig.$context;
  const session = await authContext.internalAdapter.createSession(
    reviewUser.user.id,
    false,
    {},
  );

  return {
    userId: reviewUser.user.id,
    userEmail: reviewUser.user.email,
    emailAccountId: reviewUser.user.emailAccountId,
    sessionCookie: await buildSessionCookie({
      authContext,
      expiresAt: session.expiresAt,
      sessionToken: session.token,
    }),
  };
}

async function buildSessionCookie(input: {
  authContext: Awaited<typeof betterAuthConfig.$context>;
  expiresAt: Date;
  sessionToken: string;
}) {
  const signedSessionToken = await makeSignature(
    input.sessionToken,
    input.authContext.secret,
  );
  const attributes = input.authContext.authCookies.sessionToken.attributes;
  const sameSite = attributes.sameSite;

  return {
    name: input.authContext.authCookies.sessionToken.name,
    value: `${input.sessionToken}.${signedSessionToken}`,
    options: {
      domain: attributes.domain,
      expires: input.expiresAt,
      httpOnly: attributes.httpOnly,
      maxAge: attributes.maxAge,
      partitioned: attributes.partitioned,
      path: attributes.path,
      sameSite: sameSite
        ? (sameSite.toLowerCase() as "strict" | "lax" | "none")
        : undefined,
      secure: attributes.secure,
    },
  };
}

function codesMatch(input: string, expected: string): boolean {
  const normalizedInput = normalizeCode(input);
  const normalizedExpected = normalizeCode(expected);

  if (normalizedInput.length !== normalizedExpected.length) {
    return false;
  }

  return timingSafeEqual(normalizedInput, normalizedExpected);
}

function normalizeCode(code: string): Buffer {
  return Buffer.from(code.trim(), "utf8");
}

function getMobileReviewConfig(): MobileReviewConfigResult {
  if (!env.APP_REVIEW_DEMO_ENABLED) {
    return { ok: false, reason: "review_demo_disabled" };
  }

  const reviewDemoCode = env.APP_REVIEW_DEMO_CODE?.trim();
  const reviewDemoEmail = env.APP_REVIEW_DEMO_EMAIL?.trim().toLowerCase();

  if (!reviewDemoCode || !reviewDemoEmail) {
    return {
      ok: false,
      hasReviewDemoCode: Boolean(reviewDemoCode),
      hasReviewDemoEmail: Boolean(reviewDemoEmail),
      reason: "review_demo_misconfigured",
    };
  }

  return {
    ok: true,
    reviewDemoCode,
    reviewDemoEmail,
  };
}

async function getMobileReviewUser(
  reviewDemoEmail: string,
): Promise<MobileReviewUserResult> {
  const user = await prisma.user.findUnique({
    where: { email: reviewDemoEmail },
    select: {
      email: true,
      id: true,
      emailAccounts: {
        select: {
          id: true,
        },
        take: 1,
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!user?.emailAccounts.length) {
    return {
      ok: false,
      hasUser: Boolean(user),
      reason: "review_user_missing_email_account",
    };
  }

  return {
    ok: true,
    user: {
      email: user.email,
      emailAccountId: user.emailAccounts[0].id,
      id: user.id,
    },
  };
}
