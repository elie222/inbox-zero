import { env } from "@/env";
import type { IntegrationKey } from "@/utils/mcp/integrations";
import crypto from "node:crypto";

const OAUTH_STATE_DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Generates a secure OAuth state parameter
 * @param data - The data to encode in the state
 * @returns Base64URL encoded state string
 */
export function generateOAuthState<T extends Record<string, unknown>>(
  data: T & { nonce?: string },
): string {
  const stateObject = {
    ...data,
    nonce: data.nonce || crypto.randomUUID(),
  };
  return Buffer.from(JSON.stringify(stateObject)).toString("base64url");
}

/**
 * Parses an OAuth state parameter
 * @param state - Base64URL encoded state string
 * @returns The decoded state object
 */
export function parseOAuthState<T extends Record<string, unknown>>(
  state: string,
): T & { nonce: string } {
  return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
}

export function generateSignedOAuthState<T extends Record<string, unknown>>(
  data: T & { nonce?: string; issuedAt?: number },
): string {
  const payload = {
    ...data,
    nonce: data.nonce || crypto.randomUUID(),
    issuedAt: data.issuedAt ?? Date.now(),
  };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signOAuthStatePayload(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function parseSignedOAuthState<T extends Record<string, unknown>>(
  state: string,
  options?: { maxAgeMs?: number },
): T & { nonce: string; issuedAt: number } {
  const [payloadEncoded, signature] = state.split(".");

  if (!payloadEncoded || !signature) {
    throw new Error("Invalid signed OAuth state format");
  }

  const expectedSignature = signOAuthStatePayload(payloadEncoded);
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length) {
    throw new Error("Invalid OAuth state signature");
  }

  if (!crypto.timingSafeEqual(expected, actual)) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(payloadEncoded, "base64url").toString("utf8"),
  ) as T & { nonce?: unknown; issuedAt?: unknown };

  if (typeof payload.nonce !== "string" || payload.nonce.length < 8) {
    throw new Error("Invalid OAuth state nonce");
  }

  if (
    typeof payload.issuedAt !== "number" ||
    !Number.isFinite(payload.issuedAt)
  ) {
    throw new Error("Invalid OAuth state issuedAt");
  }

  const maxAgeMs = options?.maxAgeMs ?? OAUTH_STATE_DEFAULT_MAX_AGE_MS;
  const now = Date.now();
  const elapsedMs = now - payload.issuedAt;
  if (elapsedMs < -60_000 || elapsedMs > maxAgeMs) {
    throw new Error("OAuth state expired");
  }

  return payload as T & { nonce: string; issuedAt: number };
}

/**
 * Default secure cookie options for OAuth state
 */
export const oauthStateCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV !== "development",
  maxAge: 60 * 10, // 10 minutes
  path: "/",
  sameSite: "lax",
} as const;

export const getMcpStateCookieName = (integration: IntegrationKey) =>
  `${integration}_mcp_oauth_state`;

export const getMcpPkceCookieName = (integration: IntegrationKey) =>
  `${integration}_mcp_pkce_verifier`;

export const getMcpOAuthStateType = (integration: IntegrationKey) =>
  `${integration}-mcp`;

function signOAuthStatePayload(payloadEncoded: string): string {
  return crypto
    .createHmac("sha256", getOAuthStateSigningSecret())
    .update(payloadEncoded)
    .digest("base64url");
}

function getOAuthStateSigningSecret(): string {
  return env.AUTH_SECRET || env.NEXTAUTH_SECRET || env.INTERNAL_API_KEY;
}
