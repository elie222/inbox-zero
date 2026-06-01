import { timingSafeEqual } from "node:crypto";

// Constant-time comparison for secrets/tokens (internal API key, cron secret).
// Returns false for non-strings or a length mismatch. The length check is not
// constant-time, but the secret's length is not itself sensitive here; this
// avoids the byte-by-byte early-exit of `===` on the secret contents.
export function secureCompare(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}
