import { createHash } from "node:crypto";

/**
 * Hashes sensitive identifiers (like email addresses) so they can be logged safely.
 */
export function hash<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined) return value;

  const normalized = value.trim().toLowerCase();

  return createHash("sha256").update(normalized).digest("hex") as T;
}
