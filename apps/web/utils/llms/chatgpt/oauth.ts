import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SafeError } from "@/utils/error";

// Sign in with ChatGPT, open-source plan-usage flow:
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
const AUTH_ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${AUTH_ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${AUTH_ISSUER}/api/accounts/oauth/token`;
const JWKS_URL = `${AUTH_ISSUER}/.well-known/jwks.json`;
const OPENID_CONFIGURATION_URL = `${AUTH_ISSUER}/.well-known/openid-configuration`;

export const CHATGPT_API_RESOURCE = "https://api.openai.com/v1";
export const CHATGPT_PLAN_SCOPE = "chatgpt.tokens.use.direct";
const CHATGPT_CALLBACK_PATH = "/auth/callback";
// Renewal runs under a 30s Redis lock, so a request must give up well before it.
const REQUEST_TIMEOUT_MS = 10_000;

const DYNAMIC_CLIENT_ID = "dynamic_agent_client";
const AGENT_NAME = "Inbox Zero";
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "resource.invoke",
  CHATGPT_PLAN_SCOPE,
].join(" ");

export type ChatGptTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
};

export function createChatGptHostId() {
  return `urn:uuid:${randomUUID()}`;
}

export function createOAuthRandomValue() {
  return randomBytes(32).toString("base64url");
}

// OpenAI only accepts an HTTP loopback callback on 127.0.0.1, so the app has to
// be reachable on this machine; only the port may differ from the base URL.
export function getChatGptRedirectUri(baseUrl: string): string | null {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:") return null;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
  const port = url.port || "80";
  return `http://127.0.0.1:${port}${CHATGPT_CALLBACK_PATH}`;
}

export function buildChatGptAuthorizationUrl({
  clientId,
  hostId,
  redirectUri,
  state,
  codeVerifier,
  nonce,
  idTokenHint,
}: {
  clientId: string | null;
  hostId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  nonce: string;
  idTokenHint?: string | null;
}): string {
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_id: clientId ?? DYNAMIC_CLIENT_ID,
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: CHATGPT_API_RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });
  if (!clientId) params.set("agent_name_hint", AGENT_NAME);
  if (clientId && idTokenHint) params.set("id_token_hint", idTokenHint);

  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeChatGptCode({
  clientId,
  code,
  codeVerifier,
  redirectUri,
}: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<ChatGptTokenResponse> {
  return postTokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    resource: CHATGPT_API_RESOURCE,
  });
}

export async function refreshChatGptToken({
  clientId,
  refreshToken,
}: {
  clientId: string;
  refreshToken: string;
}): Promise<ChatGptTokenResponse> {
  return postTokenRequest({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    resource: CHATGPT_API_RESOURCE,
  });
}

export async function revokeChatGptRefreshToken({
  clientId,
  refreshToken,
}: {
  clientId: string;
  refreshToken: string;
}): Promise<boolean> {
  const configuration = await fetchWithTimeout(OPENID_CONFIGURATION_URL).then(
    (response) =>
      response.ok
        ? (response.json() as Promise<{ revocation_endpoint?: string }>)
        : null,
  );
  if (!configuration?.revocation_endpoint) return false;

  const response = await fetchWithTimeout(configuration.revocation_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: clientId,
    }),
  });
  return response.ok;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function verifyChatGptIdToken({
  idToken,
  clientId,
  nonce,
}: {
  idToken: string;
  clientId: string;
  nonce: string;
}) {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: AUTH_ISSUER,
    audience: clientId,
  });
  if (payload.nonce !== nonce) {
    throw new SafeError("ChatGPT sign-in could not be verified");
  }
  if (typeof payload.sub !== "string") {
    throw new SafeError("ChatGPT sign-in returned no account");
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
  };
}

export function hasChatGptPlanScope(scope: string | undefined) {
  return (scope ?? "").split(" ").includes(CHATGPT_PLAN_SCOPE);
}

export class ChatGptTokenError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly description: string | undefined;

  constructor(
    status: number,
    code: string | undefined,
    description?: string | undefined,
  ) {
    super(`ChatGPT token request failed (${status}${code ? `: ${code}` : ""})`);
    this.status = status;
    this.code = code;
    this.description = description;
  }

  // Only a rejected grant means the sign-in itself is gone; anything else
  // (throttling, outages, malformed requests) leaves the credentials usable.
  get isTerminal() {
    return this.code === "invalid_grant" || this.status === 401;
  }
}

async function postTokenRequest(
  body: Record<string, string>,
): Promise<ChatGptTokenResponse> {
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  }).catch((error) => {
    // A timeout is temporary, so it must not count as a lost sign-in.
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ChatGptTokenError(504, "timeout");
    }
    throw error;
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: string;
      error_description?: string;
    } | null;
    throw new ChatGptTokenError(
      response.status,
      error?.error,
      error?.error_description?.slice(0, 300),
    );
  }
  return response.json() as Promise<ChatGptTokenResponse>;
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("ChatGPT request timed out", "TimeoutError"),
      ),
    REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
