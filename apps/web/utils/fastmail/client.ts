import { createScopedLogger } from "@/utils/logger";
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
      const response = await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(30_000),
      });

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
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, 30_000)),
        );
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
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, 30_000)),
        );
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

/**
 * JMAP Session response containing API URLs and account information
 * @see https://jmap.io/spec-core.html#the-jmap-session-resource
 */
export interface JMAPSession {
  accounts: Record<
    string,
    {
      name: string;
      isPersonal: boolean;
      isReadOnly: boolean;
      accountCapabilities: Record<string, unknown>;
    }
  >;
  apiUrl: string;
  capabilities: Record<string, unknown>;
  downloadUrl: string;
  eventSourceUrl: string;
  primaryAccounts: Record<string, string>;
  state: string;
  uploadUrl: string;
  username: string;
}

/**
 * JMAP API request structure
 * @see https://jmap.io/spec-core.html#the-request-object
 */
export interface JMAPRequest {
  methodCalls: JMAPMethodCall[];
  using: string[];
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
  description?: string;
  type: string;
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
      throw Object.assign(
        new SafeError(
          `JMAP error: ${error?.type || "unknown"} - ${error?.description || "No description"}`,
        ),
        { jmapMethod: "error", jmapCallId: methodResponse[2] },
      );
    }
    for (const key of ["notCreated", "notUpdated", "notDestroyed"]) {
      const failures = methodResponse[1][key] as
        | Record<string, JMAPError>
        | undefined;
      const failure = failures && Object.values(failures)[0];
      if (failure) {
        throw Object.assign(
          new SafeError(
            `JMAP error: ${failure.type} - ${failure.description || "Operation rejected"}`,
          ),
          { jmapMethod: methodResponse[0] },
        );
      }
    }
  }
}

/**
 * Fastmail client interface for making JMAP API calls
 */
export interface FastmailClient {
  /** mail API token for authentication */
  accessToken: string;
  /** Primary mail account ID */
  accountId: string;
  /** Get the current access token */
  getAccessToken: () => string;
  /** Execute JMAP method calls */
  request: (methodCalls: JMAPMethodCall[]) => Promise<JMAPResponse>;
  /** The JMAP session containing API endpoints and capabilities */
  session: JMAPSession;
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
    });
    logger.trace("JMAP session error response", { error: errorText });
    throw Object.assign(
      new SafeError(`Failed to get JMAP session: ${response.status}`),
      {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      },
    );
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
      ...(methodCalls.some(
        ([name]) =>
          name.startsWith("EmailSubmission/") || name.startsWith("Identity/"),
      )
        ? ["urn:ietf:params:jmap:submission"]
        : []),
      ...(methodCalls.some(([name]) => name.startsWith("ContactCard/"))
        ? ["urn:ietf:params:jmap:contacts"]
        : []),
    ],
    methodCalls,
  };

  // A lost response to a mutation may already have committed (or sent mail).
  const retries = methodCalls.every(([name]) =>
    /\/(get|query|changes|queryChanges)$/.test(name),
  )
    ? MAX_RETRIES
    : 0;
  const response = await fetchWithRetry(
    apiUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
    retries,
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("JMAP request failed", {
      status: response.status,
    });
    logger.trace("JMAP error response", { error: errorText });
    throw Object.assign(
      new SafeError(`JMAP request failed: ${response.status}`),
      {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      },
    );
  }

  const jmapResponse: JMAPResponse = await response.json();

  // Check for JMAP method-level errors (HTTP 200 but method failed)
  checkJMAPErrors(jmapResponse);

  return jmapResponse;
}

/**
 * Creates a new Fastmail client with the given access token
 * @param accessToken - Valid mail API token
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

export async function getFastmailClientWithRefresh({
  accessToken,
  refreshToken,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}): Promise<FastmailClient> {
  if (refreshToken || !accessToken)
    throw new SafeError("Reconnect Fastmail using a mail API token.");
  return createFastmailClient(accessToken);
}

/**
 * Extracts the access token from a Fastmail client instance
 * @param client - Initialized Fastmail client
 * @returns The mail API token
 */
export function getAccessTokenFromClient(client: FastmailClient): string {
  return client.getAccessToken();
}
