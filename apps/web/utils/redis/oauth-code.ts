import { createHash } from "node:crypto";
import { env } from "@/env";
import { redis } from "@/utils/redis";
import { sleep } from "@/utils/sleep";

const CALLBACK_RESULT_POLL_INTERVAL_MS = 250;
const CALLBACK_RESULT_WAIT_MS = 15_000;
const CALLBACK_RESULT_WRITE_ATTEMPTS = 3;
const CALLBACK_RESULT_WRITE_RETRY_MS = 250;

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

type OAuthCodeClaimOutcome =
  | { status: "claimed" }
  | { error: unknown; stage: "claim" | "wait"; status: "error" }
  | { result: OAuthCodeResult; status: "success"; waited: boolean }
  | { status: "timeout" };

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

export async function claimOAuthCodeAndWait(
  code: string,
  requestFingerprint?: string,
): Promise<OAuthCodeClaimOutcome> {
  let claim: OAuthCodeClaim;
  try {
    claim = await claimOAuthCode(code, requestFingerprint);
  } catch (error) {
    return { error, stage: "claim", status: "error" };
  }

  if (!claim) return { status: "claimed" };
  if (claim.status === "success") {
    return { result: claim, status: "success", waited: false };
  }

  const attempts = CALLBACK_RESULT_WAIT_MS / CALLBACK_RESULT_POLL_INTERVAL_MS;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, CALLBACK_RESULT_POLL_INTERVAL_MS),
    );
    try {
      const result = await getOAuthCodeResult(code);
      if (result) return { result, status: "success", waited: true };
    } catch (error) {
      return { error, stage: "wait", status: "error" };
    }
  }

  return { status: "timeout" };
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

  for (let attempt = 1; attempt <= CALLBACK_RESULT_WRITE_ATTEMPTS; attempt++) {
    try {
      await redis.set(getCodeKey(code), result, {
        ex: options?.ttlSeconds ?? 60,
      });
      return;
    } catch (error) {
      if (attempt === CALLBACK_RESULT_WRITE_ATTEMPTS) throw error;
      await sleep(CALLBACK_RESULT_WRITE_RETRY_MS);
    }
  }
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
