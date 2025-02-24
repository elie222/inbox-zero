import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";

const key = scryptSync(env.GOOGLE_ENCRYPT_SECRET, env.GOOGLE_ENCRYPT_SALT, 32); // 32 bytes for AES-256

export function encryptToken(text: string | null): string | null {
  if (!text) return null;

  // Generate a random IV for each encryption
  const iv = randomBytes(16);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Return IV + Auth Tag + Encrypted content as hex
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

export function decryptToken(encryptedText: string | null): string | null {
  if (!encryptedText) return null;

  try {
    const buffer = Buffer.from(encryptedText, "hex");

    // Extract IV (first 16 bytes)
    const iv = buffer.subarray(0, 16);

    // Extract auth tag (next 16 bytes)
    const authTag = buffer.subarray(16, 32);

    // Extract encrypted content (remaining bytes)
    const encrypted = buffer.subarray(32);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}
