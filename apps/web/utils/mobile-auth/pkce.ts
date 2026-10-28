import { createHash } from "node:crypto";
import { z } from "zod";

export const mobileAuthCodeChallengeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u);
export const mobileAuthCodeVerifierSchema = z
  .string()
  .regex(/^[A-Za-z0-9._~-]{43,128}$/u);

export function getMobileAuthCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
