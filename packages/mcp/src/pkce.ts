import crypto from "node:crypto";

/**
 * Generates a cryptographically secure code verifier for PKCE (RFC7636)
 * @returns Base64URL encoded code verifier (43-128 characters)
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32); // 32 bytes = 256 bits
  crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64url").replace(/=/g, ""); // Remove padding
}

/**
 * Generates a code challenge from a code verifier using SHA256
 * @param verifier - The code verifier
 * @returns Base64URL encoded SHA256 hash of the verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("base64url").replace(/=/g, ""); // Remove padding
}

/**
 * Generates both PKCE values needed for OAuth 2.1 flow
 * @returns Object containing code verifier and challenge
 */
export async function generatePKCEPair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/**
 * Verifies that a code verifier matches the expected challenge
 * @param verifier - The code verifier to check
 * @param challenge - The expected code challenge
 * @returns True if the verifier generates the expected challenge
 */
export async function verifyPKCEChallenge(
  verifier: string,
  challenge: string,
): Promise<boolean> {
  const computedChallenge = await generateCodeChallenge(verifier);
  return computedChallenge === challenge;
}
