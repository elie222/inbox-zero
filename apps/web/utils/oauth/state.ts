import { env } from "@/env";
import type { IntegrationKey } from "@/utils/mcp/integrations";
import crypto from "node:crypto";

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

export interface OAuthStateResultCookieValue {
  state: string;
  params: Record<string, string>;
}

export function encodeOAuthStateResultCookie(
  value: OAuthStateResultCookieValue,
): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function parseOAuthStateResultCookie(
  cookieValue: string | undefined,
): OAuthStateResultCookieValue | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8"),
    );

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.state !== "string" ||
      typeof parsed.params !== "object" ||
      Array.isArray(parsed.params)
    ) {
      return null;
    }

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.params)) {
      if (typeof key === "string" && typeof value === "string") {
        params[key] = value;
      }
    }

    return { state: parsed.state, params };
  } catch {
    return null;
  }
}
