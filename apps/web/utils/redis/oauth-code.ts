import { redis } from "@/utils/redis";
import { createHash } from "node:crypto";

// Not password hashing - creating a short cache key for OAuth authorization codes
function createOAuthCodeCacheKey(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
}

function getCodeKey(code: string) {
  return `oauth-code:${createOAuthCodeCacheKey(code)}`;
}

interface OAuthCodeResult {
  status: "success";
  params: Record<string, string>;
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
): Promise<void> {
  const result: OAuthCodeResult = {
    status: "success",
    params,
  };

  await redis.set(getCodeKey(code), result, { ex: 60 });
}

export async function clearOAuthCode(code: string): Promise<void> {
  await redis.del(getCodeKey(code));
}
