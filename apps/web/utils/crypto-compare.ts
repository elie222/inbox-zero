import { timingSafeEqual } from "node:crypto";

// Length checks are not constant-time, but secret length is not itself
// sensitive for these tokens. This avoids byte-by-byte early-exit comparisons.
export function secureCompare(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  return secureCompareBuffers(Buffer.from(a), Buffer.from(b));
}

export function secureCompareBuffers(
  a: Buffer | null | undefined,
  b: Buffer | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
