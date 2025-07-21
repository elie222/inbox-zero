import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptToken, decryptToken } from "./encryption";

// Mock server-only as it's required for tests
vi.mock("server-only", () => ({}));

// Mock the logger to prevent actual logging during tests
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    error: vi.fn(),
    log: vi.fn(),
  }),
}));

// Mock environment variables
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    EMAIL_ENCRYPT_SECRET: "test-secret-key-for-encryption-testing",
    EMAIL_ENCRYPT_SALT: "test-salt-for-encryption",
  },
}));

describe("Encryption Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("encryptToken", () => {
    it("should return null for null input", () => {
      expect(encryptToken(null)).toBeNull();
    });

    it("should encrypt a string", () => {
      const originalText = "sensitive-data-to-encrypt";
      const encrypted = encryptToken(originalText);

      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(originalText);
      expect(typeof encrypted).toBe("string");
      // Encrypted output should be a hex string, so longer than original
      expect(encrypted!.length).toBeGreaterThan(originalText.length);
    });

    it("should generate different ciphers for the same input", () => {
      const originalText = "same-input-text";
      const firstEncryption = encryptToken(originalText);
      const secondEncryption = encryptToken(originalText);

      expect(firstEncryption).not.toBe(secondEncryption);
    });
  });

  describe("decryptToken", () => {
    it("should return null for null input", () => {
      expect(decryptToken(null)).toBeNull();
    });

    it("should decrypt an encrypted string back to the original", () => {
      const originalText = "test-secret-message";
      const encrypted = encryptToken(originalText);
      const decrypted = decryptToken(encrypted!);

      expect(decrypted).toBe(originalText);
    });

    it("should handle empty string encryption/decryption", () => {
      const originalText = "";
      const encrypted = encryptToken(originalText);
      const decrypted = decryptToken(encrypted!);

      expect(decrypted).toBe(originalText);
    });

    it("should handle long string encryption/decryption", () => {
      const originalText = "A".repeat(1000);
      const encrypted = encryptToken(originalText);
      const decrypted = decryptToken(encrypted!);

      expect(decrypted).toBe(originalText);
    });

    it("should return null for invalid encrypted data", () => {
      expect(decryptToken("invalid-hex-data")).toBeNull();
    });
  });

  describe("encryption and decryption cycle", () => {
    it("should handle various types of strings", () => {
      const testStrings = [
        "Regular text",
        "Special chars: !@#$%^&*()_+",
        "Unicode: 你好, world! 😊",
        JSON.stringify({ complex: "object", with: ["nested", "arrays"] }),
        "A".repeat(5000), // Large string
      ];

      testStrings.forEach((originalText) => {
        const encrypted = encryptToken(originalText);
        const decrypted = decryptToken(encrypted!);
        expect(decrypted).toBe(originalText);
      });
    });
  });
});
