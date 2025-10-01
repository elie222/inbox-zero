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
  secure: process.env.NODE_ENV !== "development",
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
