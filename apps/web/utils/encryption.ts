import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("encryption");

// Prefix for encrypted values - makes detection reliable and prevents false positives
const ENCRYPTION_PREFIX = "enc:";

// Minimum encrypted length: IV (16 bytes) + Auth Tag (16 bytes) = 32 bytes = 64 hex chars
const MIN_ENCRYPTED_HEX_LENGTH = 64;

// Cryptographic constants
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes for authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

// Derive encryption key from environment variables
const key = scryptSync(
  env.EMAIL_ENCRYPT_SECRET,
  env.EMAIL_ENCRYPT_SALT,
  KEY_LENGTH,
);

/**
 * Encrypts a string using AES-256-GCM
 * Returns a prefixed hex string: enc:IV + Auth Tag + Encrypted content
 */
export function encryptToken(text: string | null): string | null {
  if (text === null || text === undefined) return null;

  try {
    // Generate a random IV for each encryption
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return with prefix for reliable detection
    const hexPayload = Buffer.concat([iv, authTag, encrypted]).toString("hex");
    return ENCRYPTION_PREFIX + hexPayload;
  } catch (error) {
    logger.error("Encryption failed", { error });
    return null;
  }
}

/**
 * Decrypts a string that was encrypted with encryptToken
 * Handles both prefixed (enc:...) and legacy non-prefixed formats
 */
export function decryptToken(encryptedText: string | null): string | null {
  if (encryptedText === null || encryptedText === undefined) return null;

  try {
    // Strip prefix if present (new format), otherwise use as-is (legacy format)
    const hexPayload = encryptedText.startsWith(ENCRYPTION_PREFIX)
      ? encryptedText.slice(ENCRYPTION_PREFIX.length)
      : encryptedText;

    const buffer = Buffer.from(hexPayload, "hex");

    // Extract IV (first 16 bytes)
    const iv = buffer.subarray(0, IV_LENGTH);

    // Extract auth tag (next 16 bytes)
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);

    // Extract encrypted content (remaining bytes)
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    logger.error("Decryption failed", { error });
    return null;
  }
}

/**
 * Checks if a string is in the new encrypted format (enc: prefix).
 * Only the prefix is reliable - legacy hex detection may false-positive.
 */
function isEncryptedFormat(text: string): boolean {
  return text.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Checks if a string MIGHT be legacy encrypted (hex format without prefix).
 * WARNING: This can false-positive on plaintext that happens to be 64+ hex chars.
 * Used only for migration/fallback - prefer enc: prefix for reliable detection.
 */
function mightBeLegacyEncrypted(text: string): boolean {
  if (text.length < MIN_ENCRYPTED_HEX_LENGTH) return false;
  return /^[0-9a-f]+$/i.test(text);
}

/**
 * Decrypts a token with graceful degradation for plaintext values.
 * - New format (enc: prefix): decrypt, return null if corrupted
 * - Legacy format (64+ hex chars): try decrypt, return original if fails (likely plaintext)
 * - Other: treat as plaintext, return as-is with warning
 */
export function decryptTokenWithFallback(
  encryptedText: string | null,
  fieldName?: string,
): string | null {
  if (encryptedText === null || encryptedText === undefined) return null;

  // New prefixed format - reliable detection
  if (isEncryptedFormat(encryptedText)) {
    const decrypted = decryptToken(encryptedText);
    if (decrypted === null) {
      logger.error(
        `Failed to decrypt ${fieldName || "value"} - may be corrupted`,
      );
    }
    return decrypted;
  }

  // Might be legacy encrypted (hex-only, 64+ chars) - try decryption
  if (mightBeLegacyEncrypted(encryptedText)) {
    const decrypted = decryptToken(encryptedText);
    if (decrypted !== null) {
      logger.info(
        `${fieldName || "value"} using legacy encryption format - will be re-encrypted on next save`,
      );
      return decrypted;
    }
    // Decryption failed - was actually plaintext that looked like hex
    logger.warn(
      `${fieldName || "value"} matched legacy format but failed decryption - treating as plaintext`,
    );
    return encryptedText;
  }

  // Plaintext - return with warning
  if (fieldName) {
    logger.warn(
      `${fieldName} appears to be plaintext - will be encrypted on next save`,
    );
  }
  return encryptedText;
}
