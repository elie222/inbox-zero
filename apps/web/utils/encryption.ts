import { createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-cbc";

const key = scryptSync(env.GOOGLE_ENCRYPT_SECRET, env.GOOGLE_ENCRYPT_SALT, 32); // 32 bytes for AES-256
const iv = Buffer.alloc(16, 0); // A fixed IV (all zeros)

export function encryptToken(text: string | null): string | null {
  if (!text) return null;
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("hex");
}

export function decryptToken(encryptedText: string | null): string | null {
  if (!encryptedText) return null;
  const encrypted = Buffer.from(encryptedText, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
