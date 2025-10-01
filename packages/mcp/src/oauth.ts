import type {
  McpIntegrationConfig,
  ClientCredentials,
  TokenResponse,
  CredentialStorage,
  Logger,
} from "./types";
import { generatePKCEPair } from "./pkce";
import { noopLogger } from "./logger";

/**
 * Generate OAuth authorization URL with PKCE
 */
export async function generateAuthorizationUrl({
  integration,
  redirectUri,
  state,
  storage,
  logger = noopLogger,
  staticCredentials,
  clientName,
}: {
  integration: McpIntegrationConfig;
  redirectUri: string;
  state: string;
  storage: CredentialStorage;
  logger?: Logger;
  staticCredentials?: { clientId?: string; clientSecret?: string };
  clientName?: string;
}): Promise<{
  url: string;
  codeVerifier: string;
}> {
  if (!integration.oauthConfig) {
    throw new Error(`OAuth not configured for integration ${integration.name}`);
  }

  const credentials = await getOrCreateClientCredentials(
    integration,
    redirectUri,
    storage,
    logger,
    staticCredentials,
    clientName,
  );

  const { codeVerifier, codeChallenge } = await generatePKCEPair();

  const authUrl = new URL(integration.oauthConfig.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", integration.scopes.join(" "));
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  if (integration.serverUrl) {
    authUrl.searchParams.set(
      "resource",
      getResourceOrigin(integration.serverUrl),
    );
  }

  logger.debug?.("Generated authorization URL", {
    integration: integration.name,
    hasCodeVerifier: !!codeVerifier,
  });

  return {
    url: authUrl.toString(),
    codeVerifier,
  };
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  integration: McpIntegrationConfig,
  refreshToken: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  staticCredentials?: { clientId?: string; clientSecret?: string },
): Promise<TokenResponse> {
  if (!integration.oauthConfig) {
    throw new Error(`OAuth not configured for integration ${integration.name}`);
  }

  const storedCredentials = await storage.getClientCredentials(
    integration.name,
  );
  const credentials = staticCredentials?.clientId
    ? {
        clientId: staticCredentials.clientId,
        clientSecret: staticCredentials.clientSecret,
        isDynamic: false,
      }
    : storedCredentials;

  if (!credentials?.clientId) {
    throw new Error(
      `No client credentials available for ${integration.name}. Cannot refresh token.`,
    );
  }

  const tokenRequestBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: credentials.clientId,
  });

  addOptionalTokenParams(tokenRequestBody, credentials, integration.serverUrl);

  logger.debug?.("Refreshing access token", {
    integration: integration.name,
  });

  const tokens = await fetchTokens(
    integration.oauthConfig.token_endpoint,
    tokenRequestBody,
    integration.name,
    logger,
    "Token refresh failed",
  );

  logger.debug?.("Successfully refreshed access token", {
    integration: integration.name,
  });

  return tokens;
}

/**
 * Get or create client credentials for an integration
 * Tries static credentials first, then checks storage, then performs dynamic registration
 */
export async function getOrCreateClientCredentials(
  integration: McpIntegrationConfig,
  redirectUri: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  staticCredentials?: { clientId?: string; clientSecret?: string },
  clientName?: string,
): Promise<ClientCredentials> {
  if (staticCredentials?.clientId) {
    logger.debug?.("Using static client credentials", {
      integration: integration.name,
    });
    return {
      clientId: staticCredentials.clientId,
      clientSecret: staticCredentials.clientSecret,
      isDynamic: false,
    };
  }

  const storedCredentials = await storage.getClientCredentials(
    integration.name,
  );
  if (storedCredentials) {
    logger.debug?.("Using stored client credentials", {
      integration: integration.name,
      isDynamic: storedCredentials.isDynamic,
    });
    return storedCredentials;
  }

  logger.debug?.(
    "No client credentials found, performing dynamic registration",
    {
      integration: integration.name,
    },
  );

  const credentials = await performDynamicClientRegistration(
    integration,
    redirectUri,
    logger,
    clientName,
  );

  await storage.storeClientCredentials(integration.name, credentials);

  return credentials;
}

/**
 * Performs dynamic client registration according to RFC7591
 * https://datatracker.ietf.org/doc/html/rfc7591
 *
 * This is a key feature for MCP integrations - many MCP servers support
 * dynamic registration, eliminating the need for pre-registered OAuth clients.
 */
export async function performDynamicClientRegistration(
  integration: McpIntegrationConfig,
  redirectUri: string,
  logger: Logger = noopLogger,
  clientName?: string,
): Promise<ClientCredentials> {
  if (!integration.oauthConfig?.registration_endpoint) {
    throw new Error(
      `Dynamic client registration not supported for ${integration.name} - no registration endpoint configured`,
    );
  }

  logger.debug?.("Performing dynamic client registration", {
    integration: integration.name,
    registrationUrl: integration.oauthConfig.registration_endpoint,
  });

  const registrationRequest = {
    client_name: clientName || `MCP Client - ${integration.name}`,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // Public client (PKCE provides security)
    application_type: "web",
    scope: integration.scopes.join(" "),
  };

  const response = await fetch(integration.oauthConfig.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(registrationRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error?.("Dynamic client registration failed", {
      integration: integration.name,
      status: response.status,
      error,
    });
    throw new Error(
      `Dynamic client registration failed: ${response.status} ${error}`,
    );
  }

  const registrationResponse = await response.json();

  logger.debug?.("Dynamic client registration successful", {
    integration: integration.name,
    clientId: registrationResponse.client_id,
  });

  return {
    clientId: registrationResponse.client_id,
    clientSecret: registrationResponse.client_secret || undefined,
    isDynamic: true,
  };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForTokens(
  integration: McpIntegrationConfig,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  staticCredentials?: { clientId?: string; clientSecret?: string },
  clientName?: string,
): Promise<TokenResponse> {
  if (!integration.oauthConfig) {
    throw new Error(`OAuth not configured for integration ${integration.name}`);
  }

  const credentials = await getOrCreateClientCredentials(
    integration,
    redirectUri,
    storage,
    logger,
    staticCredentials,
    clientName,
  );

  const tokenRequestBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: credentials.clientId,
    code_verifier: codeVerifier,
  });

  addOptionalTokenParams(tokenRequestBody, credentials, integration.serverUrl);

  logger.debug?.("Exchanging authorization code for tokens", {
    integration: integration.name,
  });

  const tokens = await fetchTokens(
    integration.oauthConfig.token_endpoint,
    tokenRequestBody,
    integration.name,
    logger,
    "Token exchange failed",
  );

  logger.debug?.("Successfully exchanged code for tokens", {
    integration: integration.name,
    hasRefreshToken: !!tokens.refresh_token,
  });

  return tokens;
}

/**
 * Get resource origin from server URL (MCP requirement)
 * Removes the path, keeping only the origin
 */
function getResourceOrigin(serverUrl: string): string {
  const resourceUrl = new URL(serverUrl);
  resourceUrl.pathname = "";
  return resourceUrl.toString();
}

/**
 * Add optional parameters to token request body
 */
function addOptionalTokenParams(
  body: URLSearchParams,
  credentials: ClientCredentials,
  serverUrl?: string,
): void {
  if (credentials.clientSecret) {
    body.set("client_secret", credentials.clientSecret);
  }

  if (serverUrl) {
    body.set("resource", getResourceOrigin(serverUrl));
  }
}

/**
 * Fetch tokens from OAuth endpoint with error handling
 */
async function fetchTokens(
  endpoint: string,
  body: URLSearchParams,
  integrationName: string,
  logger: Logger,
  errorMessage: string,
): Promise<TokenResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const tokens = await response.json();

  if (!response.ok) {
    logger.error?.(errorMessage, {
      integration: integrationName,
      error: tokens.error_description || tokens.error,
    });
    throw new Error(
      `${errorMessage}: ${tokens.error_description || tokens.error}`,
    );
  }

  return tokens;
}
