import { createHash, timingSafeEqual } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export function isMobileReviewEnabled(): boolean {
  return Boolean(
    env.APP_REVIEW_DEMO_ENABLED &&
      env.APP_REVIEW_DEMO_CODE?.trim() &&
      env.APP_REVIEW_DEMO_EMAIL?.trim(),
  );
}

export async function createMobileReviewSession(input: {
  code: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  if (!isMobileReviewEnabled()) {
    throw new SafeError("Review access is unavailable");
  }

  const rateLimitKey = getRateLimitKey(input.ipAddress, input.userAgent);
  await assertWithinRateLimit(rateLimitKey);

  if (!codesMatch(input.code, env.APP_REVIEW_DEMO_CODE!)) {
    throw new SafeError("Invalid review access code", 401);
  }

  const user = await prisma.user.findUnique({
    where: { email: env.APP_REVIEW_DEMO_EMAIL!.trim().toLowerCase() },
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
    {
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
    },
  );

  await clearRateLimit(rateLimitKey);

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
      sameSite: normalizeSameSite(attributes.sameSite),
      secure: attributes.secure,
    },
  };
}

async function assertWithinRateLimit(rateLimitKey: string) {
  if (!isRateLimitConfigured()) {
    return;
  }

  const attempts = await redis.incr(rateLimitKey);

  if (attempts === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
  }

  if (attempts > RATE_LIMIT_MAX_ATTEMPTS) {
    throw new SafeError(
      "Too many review access attempts. Please try again later.",
      429,
    );
  }
}

async function clearRateLimit(rateLimitKey: string) {
  if (!isRateLimitConfigured()) {
    return;
  }

  await redis.del(rateLimitKey);
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

function normalizeSameSite(
  sameSite: "Strict" | "Lax" | "None" | "strict" | "lax" | "none" | undefined,
) {
  return sameSite?.toLowerCase() as "strict" | "lax" | "none" | undefined;
}

function getRateLimitKey(ipAddress: string | null, userAgent: string | null) {
  const fingerprint = createHash("sha256")
    .update(`${ipAddress ?? "unknown"}:${userAgent ?? "unknown"}`)
    .digest("hex");

  return `mobile-review:attempts:${fingerprint}`;
}

function isRateLimitConfigured() {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}
