import { env } from "@/env";
import { request as httpsRequest } from "node:https";

const MICROSOFT_LOGIN_BASE_URL = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com";
const MICROSOFT_GRAPH_API_VERSION = "v1.0";
const MICROSOFT_IPV4_RETRY_HOSTS = new Set([
  new URL(MICROSOFT_LOGIN_BASE_URL).hostname,
  new URL(MICROSOFT_GRAPH_BASE_URL).hostname,
]);
const IPV6_UNREACHABLE_ERROR_CODES = new Set(["ENETUNREACH", "EHOSTUNREACH"]);

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

    return fetchMicrosoftUrlOverIpv4(url, init);
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

function extractErrorCodes(error: unknown): Set<string> {
  const codes = new Set<string>();
  collectErrorCodes(error, codes);
  return codes;
}

function collectErrorCodes(error: unknown, codes: Set<string>) {
  if (!error || typeof error !== "object") return;

  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;
  if (code) {
    codes.add(code);
  }

  if ("errors" in error && Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      collectErrorCodes(nestedError, codes);
    }
  }

  if ("cause" in error) {
    collectErrorCodes(error.cause, codes);
  }
}

async function fetchMicrosoftUrlOverIpv4(url: string, init?: RequestInit) {
  const parsedUrl = new URL(url);
  const body = await serializeRequestBody(init?.body);
  const headers = Object.fromEntries(new Headers(init?.headers).entries());

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: init?.method ?? "GET",
        headers,
        family: 4,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
              headers: toHeaders(response.headers),
            }),
          );
        });
      },
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

function toHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const normalizedHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const headerValue of value) {
        normalizedHeaders.append(key, headerValue);
      }
      continue;
    }

    if (value != null) {
      normalizedHeaders.append(key, value);
    }
  }

  return normalizedHeaders;
}

async function serializeRequestBody(body: RequestInit["body"]) {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }

  throw new TypeError("Unsupported Microsoft fallback request body");
}
