import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "./encryption";

const { TEST_SECRET, TEST_SALT } = vi.hoisted(() => ({
  TEST_SECRET: "test-secret-key-for-encryption-testing",
  TEST_SALT: "test-salt-for-encryption",
}));

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    EMAIL_ENCRYPT_SECRET: TEST_SECRET,
    EMAIL_ENCRYPT_SALT: TEST_SALT,
  },
}));

function legacyEncrypt(text: string): string {
  const key = scryptSync(TEST_SECRET, TEST_SALT, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

describe("Encryption Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("encryptToken", () => {
    it("returns null for null input", () => {
      expect(encryptToken(null)).toBeNull();
    });

    it("encrypts a string to a v1-prefixed ciphertext", () => {
      const encrypted = encryptToken("sensitive-data-to-encrypt");
      expect(encrypted).not.toBeNull();
      expect(encrypted).toMatch(/^v1:[0-9a-f]+$/);
    });

    it("generates different ciphertexts for the same input", () => {
      const first = encryptToken("same-input-text");
      const second = encryptToken("same-input-text");
      expect(first).not.toBe(second);
    });
  });

  describe("decryptToken", () => {
    it("returns null for null input", () => {
      expect(decryptToken(null)).toBeNull();
    });

    it("decrypts a v1 ciphertext back to the original", () => {
      const encrypted = encryptToken("test-secret-message");
      expect(decryptToken(encrypted)).toBe("test-secret-message");
    });

    it("round-trips an empty string", () => {
      const encrypted = encryptToken("");
      expect(decryptToken(encrypted)).toBe("");
    });

    it("round-trips long strings", () => {
      const text = "A".repeat(1000);
      expect(decryptToken(encryptToken(text))).toBe(text);
    });

    it("decrypts legacy unversioned ciphertext", () => {
      const legacy = legacyEncrypt("legacy-token");
      expect(decryptToken(legacy)).toBe("legacy-token");
    });

    it("returns unknown input as plaintext (backward compatibility)", () => {
      expect(decryptToken("plaintext-api-key")).toBe("plaintext-api-key");
      expect(decryptToken("sk-proj-userprovided")).toBe("sk-proj-userprovided");
    });

    it("treats short hex-looking strings as plaintext", () => {
      expect(decryptToken("deadbeef")).toBe("deadbeef");
    });

    it("throws on a corrupted v1 payload (no silent fallback)", () => {
      const encrypted = encryptToken("original") as string;
      const corrupted = `${encrypted.slice(0, -4)}dead`;
      expect(() => decryptToken(corrupted)).toThrow();
    });

    it("throws on an unknown version prefix", () => {
      expect(() => decryptToken("v9:deadbeef")).toThrow(
        /Unknown encryption version/,
      );
    });

    it("throws when plaintext coincidentally looks like `v1:<hex>` (documented edge case)", () => {
      // A user whose plaintext value happens to be a valid-looking v1 blob
      // (e.g. `v1:deadbeefdeadbeef...`) will hit the versioned path and fail
      // the GCM auth check. This is only reachable for rows that were stored
      // plaintext *before* encryption was enabled for a field; new writes go
      // through encrypt() and this exact string would be stored as ciphertext.
      const hexPayload = "00".repeat(32);
      expect(() => decryptToken(`v1:${hexPayload}`)).toThrow();
    });

    it("double-encrypted value decrypts one layer at a time", () => {
      // Guards against future callers accidentally wrapping an already-encrypted
      // value through the write path a second time. Each decrypt should peel
      // exactly one layer.
      const inner = encryptToken("hunter2") as string;
      const outer = encryptToken(inner) as string;
      expect(outer).not.toBe(inner);
      expect(decryptToken(outer)).toBe(inner);
      expect(decryptToken(inner)).toBe("hunter2");
    });
  });

  describe("encryption and decryption cycle", () => {
    it("handles various string types", () => {
      const testStrings = [
        "Regular text",
        "Special chars: !@#$%^&*()_+",
        "Unicode: 你好, world! 😊",
        JSON.stringify({ complex: "object", with: ["nested", "arrays"] }),
        "A".repeat(5000),
      ];

      for (const text of testStrings) {
        expect(decryptToken(encryptToken(text))).toBe(text);
      }
    });
  });
});
