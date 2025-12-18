import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES } from "@/utils/fastmail/scopes";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("fastmail/client");

// Fastmail JMAP API endpoints
export const FASTMAIL_JMAP_SESSION_URL =
  "https://api.fastmail.com/jmap/session";
export const FASTMAIL_OAUTH_AUTHORIZE_URL =
  "https://www.fastmail.com/dev/oidc/authorize";
export const FASTMAIL_OAUTH_TOKEN_URL =
  "https://www.fastmail.com/dev/oidc/token";
export const FASTMAIL_OAUTH_USERINFO_URL =
  "https://www.fastmail.com/dev/oidc/userinfo";

// JMAP method response types
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

export interface JMAPRequest {
  using: string[];
  methodCalls: JMAPMethodCall[];
}

export type JMAPMethodCall = [string, Record<string, unknown>, string];

export interface JMAPResponse {
  methodResponses: JMAPMethodResponse[];
  sessionState: string;
}

export type JMAPMethodResponse = [string, Record<string, unknown>, string];

export interface FastmailClient {
  session: JMAPSession;
  accessToken: string;
  accountId: string;
  request: (methodCalls: JMAPMethodCall[]) => Promise<JMAPResponse>;
  getAccessToken: () => string;
}

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
  const response = await fetch(FASTMAIL_JMAP_SESSION_URL, {
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

  const response = await fetch(apiUrl, {
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

  return response.json();
}

export async function createFastmailClient(
  accessToken: string,
): Promise<FastmailClient> {
  const session = await getJMAPSession(accessToken);

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
  expiresAt,
  emailAccountId,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}): Promise<FastmailClient> {
  if (!refreshToken) {
    logger.error("No refresh token", { emailAccountId });
    throw new SafeError("No refresh token");
  }

  // Check if token is still valid
  if (accessToken && expiresAt && expiresAt > Date.now()) {
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

  if (newAccessToken !== accessToken) {
    await saveTokens({
      tokens: {
        access_token: newAccessToken,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + tokens.expires_in
          : undefined,
      },
      accountRefreshToken: refreshToken,
      emailAccountId,
      provider: "fastmail",
    });
  }

  return createFastmailClient(newAccessToken);
}

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

export function getAccessTokenFromClient(client: FastmailClient): string {
  return client.getAccessToken();
}
