import { env } from "@/env";

const MICROSOFT_LOGIN_BASE_URL = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com";
const MICROSOFT_GRAPH_API_VERSION = "v1.0";

type MicrosoftGraphClientOptions = {
  baseUrl?: string;
  customHosts?: Set<string>;
  defaultVersion?: string;
  fetchOptions?: {
    headers?: {
      Authorization?: string;
    };
  };
};

export function isMicrosoftEmulationEnabled() {
  return !!getMicrosoftBaseUrl();
}

export function getMicrosoftOauthDiscoveryUrl() {
  const baseUrl = getMicrosoftBaseUrl();
  return baseUrl
    ? `${baseUrl}/.well-known/openid-configuration`
    : `${MICROSOFT_LOGIN_BASE_URL}/${env.MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`;
}

export function getMicrosoftOauthIssuer() {
  return (
    getMicrosoftBaseUrl() ||
    `${MICROSOFT_LOGIN_BASE_URL}/${env.MICROSOFT_TENANT_ID}/v2.0`
  );
}

export function getMicrosoftOauthAuthorizeUrl() {
  const baseUrl = getMicrosoftBaseUrl();
  return baseUrl
    ? `${baseUrl}/oauth2/v2.0/authorize`
    : `${MICROSOFT_LOGIN_BASE_URL}/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`;
}

export function getMicrosoftOauthTokenUrl() {
  const baseUrl = getMicrosoftBaseUrl();
  return baseUrl
    ? `${baseUrl}/oauth2/v2.0/token`
    : `${MICROSOFT_LOGIN_BASE_URL}/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
}

export function requestMicrosoftToken(form: Record<string, string>) {
  return fetch(getMicrosoftOauthTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
}

export function getMicrosoftGraphApiRootUrl() {
  const baseUrl = getMicrosoftBaseUrl();
  return baseUrl
    ? `${baseUrl}/${MICROSOFT_GRAPH_API_VERSION}`
    : `${MICROSOFT_GRAPH_BASE_URL}/${MICROSOFT_GRAPH_API_VERSION}`;
}

export function getMicrosoftGraphUrl(path: string) {
  return `${getMicrosoftGraphApiRootUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getMicrosoftGraphClientOptions(
  accessToken: string,
): MicrosoftGraphClientOptions {
  const baseUrl = getMicrosoftBaseUrl();
  if (!baseUrl) return {};

  return {
    baseUrl: `${baseUrl}/`,
    customHosts: new Set([new URL(baseUrl).hostname]),
    defaultVersion: MICROSOFT_GRAPH_API_VERSION,
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  };
}

function getMicrosoftBaseUrl() {
  return env.MICROSOFT_BASE_URL?.replace(/\/+$/, "") || null;
}
