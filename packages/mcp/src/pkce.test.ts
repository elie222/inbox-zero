import { describe, it, expect } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  verifyPKCEChallenge,
} from "./pkce";

describe("PKCE Utilities", () => {
  describe("generateCodeVerifier", () => {
    it("should generate a valid code verifier", () => {
      const verifier = generateCodeVerifier();

      // Should be a non-empty string
      expect(verifier).toBeTruthy();
      expect(typeof verifier).toBe("string");

      // Should be base64url encoded (43-128 chars)
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);

      // Should only contain base64url characters
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique verifiers", () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      expect(verifier1).not.toBe(verifier2);
    });
  });

  describe("generateCodeChallenge", () => {
    it("should generate a valid code challenge", async () => {
      const verifier = "test-verifier-1234567890";
      const challenge = await generateCodeChallenge(verifier);

      // Should be a non-empty string
      expect(challenge).toBeTruthy();
      expect(typeof challenge).toBe("string");

      // Should be base64url encoded
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should be deterministic (same verifier -> same challenge)", async () => {
      const verifier = "test-verifier-1234567890";
      const challenge1 = await generateCodeChallenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);

      expect(challenge1).toBe(challenge2);
    });

    it("should produce different challenges for different verifiers", async () => {
      const verifier1 = "verifier-1";
      const verifier2 = "verifier-2";

      const challenge1 = await generateCodeChallenge(verifier1);
      const challenge2 = await generateCodeChallenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe("generatePKCEPair", () => {
    it("should generate both verifier and challenge", async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEPair();

      expect(codeVerifier).toBeTruthy();
      expect(codeChallenge).toBeTruthy();
      expect(typeof codeVerifier).toBe("string");
      expect(typeof codeChallenge).toBe("string");
    });

    it("should generate matching verifier and challenge", async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEPair();

      // Verify they match
      const expectedChallenge = await generateCodeChallenge(codeVerifier);
      expect(codeChallenge).toBe(expectedChallenge);
    });

    it("should generate unique pairs each time", async () => {
      const pair1 = await generatePKCEPair();
      const pair2 = await generatePKCEPair();

      expect(pair1.codeVerifier).not.toBe(pair2.codeVerifier);
      expect(pair1.codeChallenge).not.toBe(pair2.codeChallenge);
    });
  });

  describe("verifyPKCEChallenge", () => {
    it("should verify valid verifier/challenge pairs", async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEPair();

      const isValid = await verifyPKCEChallenge(codeVerifier, codeChallenge);
      expect(isValid).toBe(true);
    });

    it("should reject invalid verifier/challenge pairs", async () => {
      const { codeVerifier } = await generatePKCEPair();
      const wrongChallenge = "invalid-challenge-12345";

      const isValid = await verifyPKCEChallenge(codeVerifier, wrongChallenge);
      expect(isValid).toBe(false);
    });

    it("should reject when verifier doesn't match challenge", async () => {
      const pair1 = await generatePKCEPair();
      const pair2 = await generatePKCEPair();

      const isValid = await verifyPKCEChallenge(
        pair1.codeVerifier,
        pair2.codeChallenge,
      );
      expect(isValid).toBe(false);
    });
  });
});
