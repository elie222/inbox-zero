import {
  getConfiguredAppReviewDemoAccounts,
  isAppReviewDemoEnabled,
  type ReviewDemoAccount,
} from "@/utils/app-review-demo";
import { betterAuthConfig } from "@/utils/auth";
import { secureCompare } from "@/utils/crypto-compare";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { buildMobileSessionCookie } from "@/utils/mobile-auth/session-cookie";
import prisma from "@/utils/prisma";

type MobileReviewConfigResult =
  | {
      ok: true;
      reviewDemoAccounts: ReviewDemoAccount[];
    }
  | {
      ok: false;
      reason: "review_demo_disabled";
    }
  | {
      ok: false;
      hasReviewDemoAccounts: boolean;
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
      hasEmailAccount: boolean;
      reason: "review_user_missing_email_account";
    };

export function isMobileReviewEnabled(): boolean {
  return isAppReviewDemoEnabled();
}

export async function createMobileReviewSession(input: {
  code: string;
  email: string;
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

  const reviewDemoAccount = getMatchingReviewAccount({
    code: input.code,
    email: input.email,
    reviewDemoAccounts: config.reviewDemoAccounts,
  });

  if (!reviewDemoAccount) {
    input.logger.warn("Mobile review sign-in rejected", {
      reason: "invalid_review_demo_code",
    });
    throw new SafeError("Invalid review access code", 401);
  }

  const reviewUser = (await getMobileReviewUsers([reviewDemoAccount]))[0];
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
    sessionCookie: await buildMobileSessionCookie({
      authContext,
      expiresAt: session.expiresAt,
      sessionToken: session.token,
    }),
  };
}

function codesMatch(input: string, expected: string): boolean {
  const normalizedInput = normalizeCode(input);
  const normalizedExpected = normalizeCode(expected);

  return secureCompare(normalizedInput, normalizedExpected);
}

function normalizeCode(code: string): string {
  return code.trim();
}

function getMobileReviewConfig(): MobileReviewConfigResult {
  if (!isAppReviewDemoEnabled()) {
    return { ok: false, reason: "review_demo_disabled" };
  }

  const reviewDemoAccounts = getConfiguredAppReviewDemoAccounts();

  if (!reviewDemoAccounts.length) {
    return {
      ok: false,
      hasReviewDemoAccounts: false,
      reason: "review_demo_misconfigured",
    };
  }

  return {
    ok: true,
    reviewDemoAccounts,
  };
}

function getMatchingReviewAccount(input: {
  code: string;
  email: string;
  reviewDemoAccounts: ReviewDemoAccount[];
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  return input.reviewDemoAccounts.find((account) => {
    if (account.email !== normalizedEmail) return false;
    return codesMatch(input.code, account.code);
  });
}

async function getMobileReviewUsers(
  reviewDemoAccounts: ReviewDemoAccount[],
): Promise<MobileReviewUserResult[]> {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      email: {
        in: reviewDemoAccounts.map((account) => account.email),
      },
    },
    select: {
      email: true,
      id: true,
      user: {
        select: {
          email: true,
          id: true,
        },
      },
    },
  });

  const accountsByEmail = new Map(
    emailAccounts.map((account) => [account.email.toLowerCase(), account]),
  );

  return reviewDemoAccounts.map((reviewDemoAccount) => {
    const emailAccount = accountsByEmail.get(reviewDemoAccount.email);
    if (!emailAccount) {
      return {
        ok: false,
        hasEmailAccount: false,
        reason: "review_user_missing_email_account",
      };
    }

    return {
      ok: true,
      user: {
        email: emailAccount.user.email,
        emailAccountId: emailAccount.id,
        id: emailAccount.user.id,
      },
    };
  });
}
