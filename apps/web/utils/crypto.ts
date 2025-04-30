import crypto from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const SECRET_KEY = Buffer.from(env.OAUTH_LINK_STATE_SECRET, "hex"); // Ensure secret is 32 bytes hex encoded
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Prepend IV and authTag to the encrypted data for storage
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

export function decrypt(encryptedText: string): string | null {
  try {
    const buffer = Buffer.from(encryptedText, "hex");
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted), // No encoding here, it's a buffer
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    // Log error appropriately if needed
    console.error("Decryption failed:", error);
    return null;
  }
}
