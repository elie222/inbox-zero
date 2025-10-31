import { createHash } from "node:crypto";

/**
 * Hashes sensitive identifiers (like email addresses) so they can be logged safely.
 */
export function hash(value: string): string;
export function hash(value: null): null;
export function hash(value: undefined): undefined;
export function hash(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;

  const normalized = value.trim().toLowerCase();

  return createHash("sha256").update(normalized).digest("hex");
}
