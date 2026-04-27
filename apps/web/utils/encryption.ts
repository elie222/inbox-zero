import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("encryption");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MIN_CIPHERTEXT_BYTES = IV_LENGTH + AUTH_TAG_LENGTH;

/**
 * Versioned ciphertext lets us rotate keys without a big-bang backfill: a row
 * carries the key version it was encrypted with, so old rows keep decrypting
 * with the old key while new writes use the active key.
 *
 * To rotate: widen `KeyVersion` (e.g. `1 | 2`), add env vars, register the new
 * key in `KEY_MATERIAL`, then bump `ACTIVE_VERSION`.
 */
type KeyVersion = 1;
const ACTIVE_VERSION: KeyVersion = 1;

const KEY_MATERIAL: Record<KeyVersion, () => { secret: string; salt: string }> =
  {
    1: () => ({
      secret: env.EMAIL_ENCRYPT_SECRET,
      salt: env.EMAIL_ENCRYPT_SALT,
    }),
  };

const keyCache = new Map<KeyVersion, Buffer>();

export function encryptToken(text: string | null): string | null {
  if (text === null || text === undefined) return null;
  if (!isConfigured(ACTIVE_VERSION)) {
    logger.error("Encryption key not configured; refusing to encrypt");
    return null;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(ACTIVE_VERSION), iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("hex");
  return `v${ACTIVE_VERSION}:${payload}`;
}

/**
 * Decrypts a value produced by `encryptToken`. Also accepts:
 * - Legacy unversioned ciphertext (same format, no `v1:` prefix): transparently decrypted.
 * - Plaintext (anything that neither parses as a versioned payload nor legacy-decrypts): returned as-is.
 *
 * Plaintext pass-through lets us add encryption to a field that currently
 * holds plaintext without a forced migration. Newly encrypted rows carry the
 * `v1:` prefix; old rows keep working until they're naturally rewritten.
 *
 * Corrupted versioned payloads throw (unlike the legacy behavior of silently
 * returning null) so callers don't receive invalid data.
 */
export function decryptToken(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  if (!isConfigured(ACTIVE_VERSION)) {
    logger.error("Encryption key not configured; refusing to decrypt");
    return null;
  }

  const versioned = parseVersioned(value);
  if (versioned) return decryptHex(versioned.payload, versioned.version);

  const legacy = tryLegacyDecrypt(value);
  if (legacy !== null) return legacy;

  return value;
}

function parseVersioned(
  value: string,
): { version: KeyVersion; payload: string } | null {
  const match = value.match(/^v(\d+):([0-9a-f]+)$/i);
  if (!match) return null;
  const version = Number(match[1]);
  if (!(version in KEY_MATERIAL)) {
    throw new Error(`Unknown encryption version: v${version}`);
  }
  return { version: version as KeyVersion, payload: match[2] };
}

function decryptHex(hex: string, version: KeyVersion): string {
  const buffer = Buffer.from(hex, "hex");
  if (buffer.length < MIN_CIPHERTEXT_BYTES) {
    throw new Error("Ciphertext too short");
  }
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(version), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

function tryLegacyDecrypt(value: string): string | null {
  if (!/^[0-9a-f]+$/i.test(value)) return null;
  if (value.length < MIN_CIPHERTEXT_BYTES * 2) return null;
  try {
    return decryptHex(value, 1);
  } catch (error) {
    logger.warn("Legacy decrypt attempt failed; treating as plaintext", {
      error,
    });
    return null;
  }
}

function isConfigured(version: KeyVersion): boolean {
  const material = KEY_MATERIAL[version];
  if (!material) return false;
  const { secret, salt } = material();
  return Boolean(secret && salt);
}

function getKey(version: KeyVersion): Buffer {
  const cached = keyCache.get(version);
  if (cached) return cached;

  const material = KEY_MATERIAL[version];
  if (!material) throw new Error(`No key material for v${version}`);

  const { secret, salt } = material();
  if (!secret || !salt) {
    throw new Error(`Encryption key v${version} is not configured`);
  }

  const key = scryptSync(secret, salt, KEY_LENGTH);
  keyCache.set(version, key);
  return key;
}
