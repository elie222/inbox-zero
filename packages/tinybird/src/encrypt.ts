import { createCipheriv, createDecipheriv, scryptSync } from "crypto";

// don't store the text in plain text in our database to increase user privacy.
// use a deterministic encryption algorithm so that we can perform analytics on the data
// and decrypt it later. we use a fixed iv so that the encryption is deterministic.
// for stronger encryption don't use a fixed iv but for our use case this is fine.

const ALGORITHM = "aes-256-cbc";

const password = process.env.ENCRYPT_SECRET;
const salt = process.env.ENCRYPT_SALT;

if (password && !salt) throw new Error("Missing TINYBIRD_ENCRYPT_SALT");

const key = password && salt ? scryptSync(password, salt, 32) : undefined; // 32 bytes for AES-256
const iv = Buffer.alloc(16, 0); // A fixed IV (all zeros);

export function encrypt(text: string): string {
  if (!key) return text;
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("hex");
}

export function decrypt(encryptedText: string): string {
  if (!key) return encryptedText;
  const encrypted = Buffer.from(encryptedText, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
