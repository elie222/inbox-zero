import { createHmac } from "node:crypto";
import { env } from "@/env";

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

  // This is a keyed HMAC for deterministic log identifiers, not password
  // storage or verification.
  // codeql[js/insufficient-password-hash]
  const digest = createHmac("sha256", env.EMAIL_ENCRYPT_SALT)
    .update(normalized)
    .digest("hex");

  return digest;
}
