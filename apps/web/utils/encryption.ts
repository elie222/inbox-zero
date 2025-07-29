import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("encryption");

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
 * Returns a hex string containing: IV + Auth Tag + Encrypted content
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

    // Return IV + Auth Tag + Encrypted content as hex
    return Buffer.concat([iv, authTag, encrypted]).toString("hex");
  } catch (error) {
    logger.error("Encryption failed", { error });
    return null;
  }
}

/**
 * Decrypts a string that was encrypted with encryptToken
 * Expects a hex string containing: IV + Auth Tag + Encrypted content
 */
export function decryptToken(encryptedText: string | null): string | null {
  if (encryptedText === null || encryptedText === undefined) return null;

  try {
    const buffer = Buffer.from(encryptedText, "hex");

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
