import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES } from "@/utils/fastmail/scopes";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("fastmail/client");

/** Maximum number of retries for transient errors */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff */
const BASE_RETRY_DELAY = 1000;

/**
 * Determines if an HTTP status code indicates a transient error worth retrying
 */
function isTransientError(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

/**
 * Executes a fetch request with exponential backoff retry for transient errors
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If success or non-transient error, return immediately
      if (response.ok || !isTransientError(response.status)) {
        return response;
      }

      lastResponse = response;

      // Check for Retry-After header (can be seconds or HTTP-date per RFC 7231)
      const retryAfter = response.headers.get("Retry-After");
      let delay = BASE_RETRY_DELAY * 2 ** attempt;
      if (retryAfter) {
        const parsedSeconds = Number.parseInt(retryAfter, 10);
        if (!Number.isNaN(parsedSeconds)) {
          delay = parsedSeconds * 1000;
        } else {
          // Try parsing as HTTP-date
          const retryDate = Date.parse(retryAfter);
          if (!Number.isNaN(retryDate)) {
            delay = Math.max(0, retryDate - Date.now());
          }
        }
      }

      if (attempt < retries) {
        logger.warn("Transient error, retrying", {
          status: response.status,
          attempt: attempt + 1,
          maxRetries: retries,
          delayMs: delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delay = BASE_RETRY_DELAY * 2 ** attempt;
        logger.warn("Network error, retrying", {
          error: lastError.message,
          attempt: attempt + 1,
          maxRetries: retries,
          delayMs: delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  if (lastResponse) {
    return lastResponse;
  }
  throw lastError || new Error("Request failed after retries");
}

/**
 * Fastmail JMAP API endpoints
 * @see https://www.fastmail.com/dev/
 */

/** JMAP session endpoint for initializing API access */
export const FASTMAIL_JMAP_SESSION_URL =
  "https://api.fastmail.com/jmap/session";

/** OAuth authorization endpoint for user consent */
export const FASTMAIL_OAUTH_AUTHORIZE_URL =
  "https://www.fastmail.com/dev/oidc/authorize";

/** OAuth token exchange endpoint */
export const FASTMAIL_OAUTH_TOKEN_URL =
  "https://www.fastmail.com/dev/oidc/token";

/** OpenID Connect userinfo endpoint */
export const FASTMAIL_OAUTH_USERINFO_URL =
  "https://www.fastmail.com/dev/oidc/userinfo";

/**
 * JMAP Session response containing API URLs and account information
 * @see https://jmap.io/spec-core.html#the-jmap-session-resource
 */
export interface JMAPSession {
  username: string;
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
  state: string;
  accounts: Record<
    string,
    {
      name: string;
      isPersonal: boolean;
      isReadOnly: boolean;
      accountCapabilities: Record<string, unknown>;
    }
  >;
  primaryAccounts: Record<string, string>;
  capabilities: Record<string, unknown>;
}

/**
 * JMAP API request structure
 * @see https://jmap.io/spec-core.html#the-request-object
 */
export interface JMAPRequest {
  using: string[];
  methodCalls: JMAPMethodCall[];
}

/** JMAP method call tuple: [methodName, arguments, callId] */
export type JMAPMethodCall = [string, Record<string, unknown>, string];

/**
 * JMAP API response structure
 * @see https://jmap.io/spec-core.html#the-response-object
 */
export interface JMAPResponse {
  methodResponses: JMAPMethodResponse[];
  sessionState: string;
}

/** JMAP method response tuple: [methodName, result, callId] */
export type JMAPMethodResponse = [string, Record<string, unknown>, string];

/**
 * JMAP error types that can appear in method responses
 * @see https://jmap.io/spec-core.html#errors
 */
export interface JMAPError {
  type: string;
  description?: string;
}

/**
 * Checks if a JMAP method response is an error response
 * JMAP can return HTTP 200 with errors in the methodResponses array
 */
export function isJMAPError(response: JMAPMethodResponse): boolean {
  return response[0] === "error";
}

/**
 * Extracts error information from a JMAP error response
 */
export function getJMAPError(response: JMAPMethodResponse): JMAPError | null {
  if (!isJMAPError(response)) return null;
  const data = response[1];
  return {
    type: (data.type as string) || "unknown",
    description: data.description as string | undefined,
  };
}

/**
 * Checks all method responses for errors and throws if any found
 * @param response - The JMAP response to check
 * @throws SafeError if any method response is an error
 */
export function checkJMAPErrors(response: JMAPResponse): void {
  for (const methodResponse of response.methodResponses) {
    if (isJMAPError(methodResponse)) {
      const error = getJMAPError(methodResponse);
      throw new SafeError(
        `JMAP error: ${error?.type || "unknown"} - ${error?.description || "No description"}`,
      );
    }
  }
}

/**
 * Fastmail client interface for making JMAP API calls
 */
export interface FastmailClient {
  /** The JMAP session containing API endpoints and capabilities */
  session: JMAPSession;
  /** OAuth access token for authentication */
  accessToken: string;
  /** Primary mail account ID */
  accountId: string;
  /** Execute JMAP method calls */
  request: (methodCalls: JMAPMethodCall[]) => Promise<JMAPResponse>;
  /** Get the current access token */
  getAccessToken: () => string;
}

/**
 * Returns OAuth2 configuration for Fastmail account linking
 * @returns OAuth2 config with client credentials and redirect URI
 */
export function getLinkingOAuth2Config() {
  return {
    clientId: env.FASTMAIL_CLIENT_ID || "",
    clientSecret: env.FASTMAIL_CLIENT_SECRET || "",
    redirectUri: `${env.NEXT_PUBLIC_BASE_URL}/api/fastmail/linking/callback`,
    authorizeUrl: FASTMAIL_OAUTH_AUTHORIZE_URL,
    tokenUrl: FASTMAIL_OAUTH_TOKEN_URL,
    scopes: SCOPES,
  };
}

async function getJMAPSession(accessToken: string): Promise<JMAPSession> {
  const response = await fetchWithRetry(FASTMAIL_JMAP_SESSION_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Failed to get JMAP session", {
      status: response.status,
      error: errorText,
    });
    throw new SafeError(`Failed to get JMAP session: ${response.status}`);
  }

  return response.json();
}

async function makeJMAPRequest(
  apiUrl: string,
  accessToken: string,
  methodCalls: JMAPMethodCall[],
): Promise<JMAPResponse> {
  const request: JMAPRequest = {
    using: [
      "urn:ietf:params:jmap:core",
      "urn:ietf:params:jmap:mail",
      "urn:ietf:params:jmap:submission",
    ],
    methodCalls,
  };

  const response = await fetchWithRetry(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("JMAP request failed", {
      status: response.status,
      error: errorText,
    });
    throw new SafeError(`JMAP request failed: ${response.status}`);
  }

  const jmapResponse: JMAPResponse = await response.json();

  // Check for JMAP method-level errors (HTTP 200 but method failed)
  checkJMAPErrors(jmapResponse);

  return jmapResponse;
}

/**
 * Creates a new Fastmail client with the given access token
 * @param accessToken - Valid OAuth access token
 * @returns Initialized FastmailClient ready for JMAP API calls
 * @throws SafeError if no mail account found in session
 */
export async function createFastmailClient(
  accessToken: string,
): Promise<FastmailClient> {
  const session = await getJMAPSession(accessToken);

  // Validate required JMAP capabilities
  const requiredCapabilities = [
    "urn:ietf:params:jmap:core",
    "urn:ietf:params:jmap:mail",
  ];
  for (const capability of requiredCapabilities) {
    if (!session.capabilities[capability]) {
      logger.error("Missing required JMAP capability", { capability });
      throw new SafeError(`Missing required JMAP capability: ${capability}`);
    }
  }

  // Get the primary mail account ID
  const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
  if (!accountId) {
    throw new SafeError("No mail account found in JMAP session");
  }

  return {
    session,
    accessToken,
    accountId,
    request: (methodCalls: JMAPMethodCall[]) =>
      makeJMAPRequest(session.apiUrl, accessToken, methodCalls),
    getAccessToken: () => accessToken,
  };
}

/**
 * Gets a Fastmail client, automatically refreshing the access token if expired
 * @param options - Token and account information
 * @param options.accessToken - Current access token (may be expired for OAuth, never expires for app tokens)
 * @param options.refreshToken - OAuth refresh token for getting new access token (null for app token accounts)
 * @param options.expiresAt - Expiration timestamp of current access token (null for app tokens)
 * @param options.emailAccountId - Email account ID for saving refreshed tokens
 * @returns Initialized FastmailClient with valid access token
 * @throws SafeError if no access token or refresh fails
 */
export async function getFastmailClientWithRefresh({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}): Promise<FastmailClient> {
  // App token accounts: no refresh token but access token exists
  // App tokens don't expire, so we can use them directly
  if (!refreshToken && accessToken) {
    return createFastmailClient(accessToken);
  }

  if (!refreshToken) {
    logger.error("No refresh token and no access token", { emailAccountId });
    throw new SafeError("No refresh token");
  }

  // Check if token is still valid
  // expiresAt can be stored as either:
  // - Unix timestamp in seconds (legacy from auth.ts)
  // - Date timestamp in milliseconds (from callback route)
  // Handle both by checking if value is reasonable (< year 3000 in seconds = ~32503680000)
  const expiresAtMs =
    expiresAt && expiresAt < 32_503_680_000
      ? expiresAt * 1000 // Unix timestamp in seconds
      : expiresAt; // Already milliseconds or Date timestamp

  if (accessToken && expiresAtMs && expiresAtMs > Date.now()) {
    return createFastmailClient(accessToken);
  }

  // Refresh the token
  const config = getLinkingOAuth2Config();
  const response = await fetch(FASTMAIL_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Failed to refresh Fastmail token", {
      status: response.status,
      error: errorText,
      emailAccountId,
    });
    throw new SafeError("Failed to refresh Fastmail token");
  }

  const tokens = await response.json();
  const newAccessToken = tokens.access_token;
  const newRefreshToken = tokens.refresh_token;

  // Always save tokens after successful refresh to handle:
  // 1. New access token
  // 2. Rotated refresh token (some OAuth servers rotate refresh tokens)
  // 3. Updated expiration time
  await saveTokens({
    tokens: {
      access_token: newAccessToken,
      refresh_token: newRefreshToken || refreshToken, // Keep old if not rotated
      // saveTokens expects expires_at as Unix timestamp in seconds
      expires_at: tokens.expires_in
        ? Math.floor(Date.now() / 1000) + tokens.expires_in
        : undefined,
    },
    accountRefreshToken: refreshToken,
    emailAccountId,
    provider: "fastmail",
  });

  return createFastmailClient(newAccessToken);
}

/**
 * Fetches user information from Fastmail's OpenID Connect userinfo endpoint
 * @param accessToken - Valid OAuth access token with openid scope
 * @returns User info including sub (subject ID), email, and optional name
 * @throws SafeError if the request fails
 */
export async function getUserInfo(
  accessToken: string,
): Promise<{ sub: string; email: string; name?: string }> {
  const response = await fetch(FASTMAIL_OAUTH_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Failed to get user info", {
      status: response.status,
      error: errorText,
    });
    throw new SafeError(`Failed to get user info: ${response.status}`);
  }

  return response.json();
}

/**
 * Extracts the access token from a Fastmail client instance
 * @param client - Initialized Fastmail client
 * @returns The OAuth access token
 */
export function getAccessTokenFromClient(client: FastmailClient): string {
  return client.getAccessToken();
}
