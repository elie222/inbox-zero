import { env } from "@/env";
import type { IntegrationKey } from "@/utils/mcp/integrations";
import crypto from "node:crypto";

const OAUTH_STATE_DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

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

export function validateSignedOAuthState<
  T extends Record<string, unknown>,
>(params: {
  receivedState: string | null;
  storedState: string | undefined;
  maxAgeMs?: number;
}):
  | {
      success: true;
      state: T & { nonce: string; issuedAt: number };
    }
  | {
      success: false;
      error: "invalid_state" | "invalid_state_format";
    } {
  if (
    !params.storedState ||
    !params.receivedState ||
    params.storedState !== params.receivedState
  ) {
    return {
      success: false,
      error: "invalid_state",
    };
  }

  try {
    return {
      success: true,
      state: parseSignedOAuthState<T>(params.storedState, {
        maxAgeMs: params.maxAgeMs,
      }),
    };
  } catch {
    return {
      success: false,
      error: "invalid_state_format",
    };
  }
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
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Either AUTH_SECRET or NEXTAUTH_SECRET environment variable must be defined",
    );
  }

  return secret;
}
