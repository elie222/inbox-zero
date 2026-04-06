import { timingSafeEqual } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export function isMobileReviewEnabled(): boolean {
  return Boolean(
    env.APP_REVIEW_DEMO_ENABLED &&
      env.APP_REVIEW_DEMO_CODE?.trim() &&
      env.APP_REVIEW_DEMO_EMAIL?.trim(),
  );
}

export async function createMobileReviewSession(input: { code: string }) {
  if (!isMobileReviewEnabled()) {
    throw new SafeError("Review access is unavailable");
  }

  const reviewDemoCode = env.APP_REVIEW_DEMO_CODE?.trim();
  const reviewDemoEmail = env.APP_REVIEW_DEMO_EMAIL?.trim().toLowerCase();

  if (!reviewDemoCode || !reviewDemoEmail) {
    throw new SafeError("Review access is unavailable");
  }

  if (!codesMatch(input.code, reviewDemoCode)) {
    throw new SafeError("Invalid review access code", 401);
  }

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
    throw new SafeError("Review access is unavailable");
  }

  const authContext = await betterAuthConfig.$context;
  const session = await authContext.internalAdapter.createSession(
    user.id,
    false,
    {},
  );

  return {
    userId: user.id,
    userEmail: user.email,
    emailAccountId: user.emailAccounts[0].id,
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
