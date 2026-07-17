import { createHash } from "node:crypto";
import { env } from "@/env";
import { redis } from "@/utils/redis";

// Not password hashing - creating a short cache key for OAuth authorization codes
function createOAuthCodeCacheKey(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
}

function getCodeKey(code: string) {
  return `oauth-code:${createOAuthCodeCacheKey(code)}`;
}

export interface OAuthCodeResult {
  params: Record<string, string>;
  requestFingerprint?: string;
  status: "success";
}

interface OAuthCodeProcessing {
  requestFingerprint?: string;
  status: "processing";
}

type OAuthCodeClaim = OAuthCodeProcessing | OAuthCodeResult | null;

export function isOAuthCodeStoreConfigured() {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}

export async function claimOAuthCode(
  code: string,
  requestFingerprint?: string,
): Promise<OAuthCodeClaim> {
  const existing = await redis.set<OAuthCodeProcessing | OAuthCodeResult>(
    getCodeKey(code),
    { requestFingerprint, status: "processing" },
    {
      ex: 600,
      get: true,
      nx: true,
    },
  );

  if (typeof existing === "string") return { status: "processing" };

  return existing as OAuthCodeClaim;
}

export async function acquireOAuthCodeLock(code: string): Promise<boolean> {
  const result = await redis.set(getCodeKey(code), "processing", {
    ex: 60,
    nx: true, // Only set if key doesn't exist (atomic)
  });

  return result === "OK";
}

export async function getOAuthCodeResult(
  code: string,
): Promise<OAuthCodeResult | null> {
  const value = await redis.get<string | OAuthCodeResult>(getCodeKey(code));

  if (!value || value === "processing") {
    return null;
  }

  if (typeof value === "object" && value.status === "success") {
    return value;
  }

  return null;
}

export async function setOAuthCodeResult(
  code: string,
  params: Record<string, string>,
  options?: {
    requestFingerprint?: string;
    ttlSeconds?: number;
  },
): Promise<void> {
  const result: OAuthCodeResult = {
    status: "success",
    params,
    requestFingerprint: options?.requestFingerprint,
  };

  await redis.set(getCodeKey(code), result, {
    ex: options?.ttlSeconds ?? 60,
  });
}

/**
 * Clear the OAuth code from Redis.
 * Fails silently - cleanup errors should never mask the original error in catch blocks.
 */
export async function clearOAuthCode(code: string): Promise<void> {
  try {
    await redis.del(getCodeKey(code));
  } catch {
    // Silently ignore - this is called in error handlers where we don't want
    // cleanup failures to mask the original error
  }
}
