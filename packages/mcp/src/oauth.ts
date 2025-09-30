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
): Promise<ClientCredentials> {
  if (!integration.oauthConfig?.registration_endpoint) {
    throw new Error(
      `Dynamic client registration not supported for ${integration.name} - no registration endpoint configured`,
    );
  }

  logger.info?.("Performing dynamic client registration", {
    integration: integration.name,
    registrationUrl: integration.oauthConfig.registration_endpoint,
  });

  // Prepare registration request according to RFC7591
  const registrationRequest = {
    client_name: `MCP Client - ${integration.displayName}`,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // Public client (PKCE provides security)
    application_type: "web",
    scope: integration.defaultScopes.join(" "),
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

  logger.info?.("Dynamic client registration successful", {
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
 * Get or create client credentials for an integration
 * Tries static credentials first, then checks storage, then performs dynamic registration
 */
export async function getOrCreateClientCredentials(
  integration: McpIntegrationConfig,
  redirectUri: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  staticCredentials?: { clientId?: string; clientSecret?: string },
): Promise<ClientCredentials> {
  // First, try static credentials from environment/config
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

  // Next, check if we have stored credentials (from previous dynamic registration)
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

  // No credentials available - perform dynamic registration
  logger.info?.(
    "No client credentials found, performing dynamic registration",
    {
      integration: integration.name,
    },
  );

  const credentials = await performDynamicClientRegistration(
    integration,
    redirectUri,
    logger,
  );

  // Store the dynamically registered credentials for future use
  await storage.storeClientCredentials(integration.name, credentials);

  return credentials;
}

/**
 * Generate OAuth authorization URL with PKCE
 */
export async function generateAuthorizationUrl(
  integration: McpIntegrationConfig,
  redirectUri: string,
  state: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  staticCredentials?: { clientId?: string; clientSecret?: string },
): Promise<{
  url: string;
  codeVerifier: string;
}> {
  if (!integration.oauthConfig) {
    throw new Error(`OAuth not configured for integration ${integration.name}`);
  }

  // Get or create client credentials
  const credentials = await getOrCreateClientCredentials(
    integration,
    redirectUri,
    storage,
    logger,
    staticCredentials,
  );

  // Generate PKCE pair
  const { codeVerifier, codeChallenge } = await generatePKCEPair();

  // Build authorization URL
  const authUrl = new URL(integration.oauthConfig.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", integration.defaultScopes.join(" "));
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  // Add resource parameter if server URL is available (MCP requirement)
  if (integration.serverUrl) {
    const resourceUrl = new URL(integration.serverUrl);
    resourceUrl.pathname = ""; // Remove path, keep only origin
    authUrl.searchParams.set("resource", resourceUrl.toString());
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
): Promise<TokenResponse> {
  if (!integration.oauthConfig) {
    throw new Error(`OAuth not configured for integration ${integration.name}`);
  }

  // Get client credentials (should exist at this point)
  const credentials = await getOrCreateClientCredentials(
    integration,
    redirectUri,
    storage,
    logger,
    staticCredentials,
  );

  const tokenRequestBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: credentials.clientId,
    code_verifier: codeVerifier,
  });

  // Add client secret if available (for confidential clients)
  if (credentials.clientSecret) {
    tokenRequestBody.set("client_secret", credentials.clientSecret);
  }

  // Add resource parameter if server URL is available (MCP requirement)
  if (integration.serverUrl) {
    const resourceUrl = new URL(integration.serverUrl);
    resourceUrl.pathname = "";
    tokenRequestBody.set("resource", resourceUrl.toString());
  }

  logger.debug?.("Exchanging authorization code for tokens", {
    integration: integration.name,
  });

  const response = await fetch(integration.oauthConfig.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenRequestBody,
  });

  const tokens = await response.json();

  if (!response.ok) {
    logger.error?.("Token exchange failed", {
      integration: integration.name,
      error: tokens.error_description || tokens.error,
    });
    throw new Error(
      `Token exchange failed: ${tokens.error_description || tokens.error}`,
    );
  }

  logger.info?.("Successfully exchanged code for tokens", {
    integration: integration.name,
    hasRefreshToken: !!tokens.refresh_token,
  });

  return tokens;
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

  // Get client credentials
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

  if (credentials.clientSecret) {
    tokenRequestBody.set("client_secret", credentials.clientSecret);
  }

  // Add resource parameter if server URL is available (MCP requirement)
  if (integration.serverUrl) {
    const resourceUrl = new URL(integration.serverUrl);
    resourceUrl.pathname = "";
    tokenRequestBody.set("resource", resourceUrl.toString());
  }

  logger.debug?.("Refreshing access token", {
    integration: integration.name,
  });

  const response = await fetch(integration.oauthConfig.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenRequestBody,
  });

  const tokens = await response.json();

  if (!response.ok) {
    logger.error?.("Token refresh failed", {
      integration: integration.name,
      error: tokens.error_description || tokens.error,
    });
    throw new Error(
      `Token refresh failed: ${tokens.error_description || tokens.error}`,
    );
  }

  logger.info?.("Successfully refreshed access token", {
    integration: integration.name,
  });

  return tokens;
}
