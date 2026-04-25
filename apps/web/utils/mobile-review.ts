import { timingSafeEqual } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { z } from "zod";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

type MobileReviewConfigResult =
  | {
      ok: true;
      reviewDemoAccounts: MobileReviewAccount[];
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

type MobileReviewAccount = {
  code: string;
  email: string;
};

const reviewDemoAccountsSchema = z.array(
  z.object({
    code: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().email(),
  }),
);

export function isMobileReviewEnabled(): boolean {
  return Boolean(
    env.APP_REVIEW_DEMO_ENABLED && getConfiguredReviewAccounts().length > 0,
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

  let reviewUsers: MobileReviewUserResult[];
  try {
    reviewUsers = await getMobileReviewUsers(config.reviewDemoAccounts);
  } catch (error) {
    input.logger.warn("Mobile review access unavailable", {
      reason: "review_user_lookup_failed",
      error,
    });
    return { enabled: false as const };
  }

  const missingReviewUsers = reviewUsers.filter((reviewUser) => !reviewUser.ok);
  if (missingReviewUsers.length) {
    input.logger.warn("Mobile review access unavailable", {
      count: missingReviewUsers.length,
      reasons: missingReviewUsers,
    });
    return { enabled: false as const };
  }

  return { enabled: true as const };
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

  const reviewDemoAccounts = getConfiguredReviewAccounts();

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

function getConfiguredReviewAccounts(): MobileReviewAccount[] {
  return parseReviewDemoAccounts(env.APP_REVIEW_DEMO_ACCOUNTS);
}

function parseReviewDemoAccounts(
  value: string | undefined,
): MobileReviewAccount[] {
  if (!value?.trim()) return [];

  try {
    const parsed = reviewDemoAccountsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function getMatchingReviewAccount(input: {
  code: string;
  email: string;
  reviewDemoAccounts: MobileReviewAccount[];
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  return input.reviewDemoAccounts.find((account) => {
    if (account.email !== normalizedEmail) return false;
    return codesMatch(input.code, account.code);
  });
}

async function getMobileReviewUsers(
  reviewDemoAccounts: MobileReviewAccount[],
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
