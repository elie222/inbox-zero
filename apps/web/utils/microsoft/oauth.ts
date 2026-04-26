import { env } from "@/env";
import { Agent, type Dispatcher } from "undici";

const MICROSOFT_LOGIN_BASE_URL = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com";
const MICROSOFT_GRAPH_API_VERSION = "v1.0";
const MICROSOFT_IPV4_RETRY_HOSTS = new Set([
  new URL(MICROSOFT_LOGIN_BASE_URL).hostname,
  new URL(MICROSOFT_GRAPH_BASE_URL).hostname,
]);
const IPV6_UNREACHABLE_ERROR_CODES = new Set(["ENETUNREACH", "EHOSTUNREACH"]);
const microsoftIpv4Dispatcher = new Agent({
  connect: { family: 4 },
});

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

type MicrosoftUserProfile = {
  id?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
};

export class MicrosoftUserProfileError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MicrosoftUserProfileError";
    this.status = status;
  }
}

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
  return fetchMicrosoftUrl(getMicrosoftOauthTokenUrl(), {
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

export function fetchMicrosoftGraph(path: string, init?: RequestInit) {
  return fetchMicrosoftUrl(getMicrosoftGraphUrl(path), init);
}

export async function fetchMicrosoftUserProfile(accessToken: string) {
  const response = await fetchMicrosoftGraph("/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftUserProfileError(
      "Failed to fetch Microsoft user profile",
      response.status,
    );
  }

  const profile = (await response.json()) as MicrosoftUserProfile;
  const email = profile.mail || profile.userPrincipalName;

  if (!email) {
    throw new MicrosoftUserProfileError("Profile missing required email");
  }

  return { profile, email };
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

async function fetchMicrosoftUrl(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!shouldRetryWithIpv4(url, error)) {
      throw error;
    }

    return fetch(url, {
      ...init,
      dispatcher: microsoftIpv4Dispatcher,
    } as RequestInit & { dispatcher: Dispatcher });
  }
}

function shouldRetryWithIpv4(url: string, error: unknown) {
  if (getMicrosoftBaseUrl()) return false;

  const hostname = new URL(url).hostname;
  if (!MICROSOFT_IPV4_RETRY_HOSTS.has(hostname)) return false;

  for (const code of extractErrorCodes(error)) {
    if (IPV6_UNREACHABLE_ERROR_CODES.has(code)) {
      return true;
    }
  }

  return false;
}

function extractErrorCodes(
  error: unknown,
  codes = new Set<string>(),
): Set<string> {
  if (!error || typeof error !== "object") return codes;

  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;
  if (code) {
    codes.add(code);
  }

  if ("errors" in error && Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      extractErrorCodes(nestedError, codes);
    }
  }

  if ("cause" in error) {
    extractErrorCodes(error.cause, codes);
  }

  return codes;
}
