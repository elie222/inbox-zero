import {
  startAuthorization,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  InvalidClientError,
  InvalidGrantError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getMcpFetch } from "@/utils/mcp/safe-fetch";
import type { ResolvedMcpIntegration } from "@/utils/mcp/resolve-integration";

const logger = createScopedLogger("mcp-oauth");

// Conservative default expiration window when OAuth provider doesn't return expires_in
// Set to 1 hour to ensure tokens are refreshed proactively
const DEFAULT_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Refresh slightly early so a token doesn't expire mid-agent-run
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start OAuth flow - generate authorization URL with PKCE
 * Returns the URL to redirect to and the code verifier to save in cookies
 */
export async function generateOAuthUrl({
  integration,
  redirectUri,
  state,
}: {
  integration: ResolvedMcpIntegration;
  redirectUri: string;
  state: string;
}): Promise<{
  url: string;
  codeVerifier: string;
}> {
  if (!integration.serverUrl) {
    throw new Error(`No server URL configured for ${integration.name}`);
  }

  const clientInfo = await getOAuthClient(integration, redirectUri);
  const metadata = await discoverMetadata(integration);

  if (!metadata.authorization_endpoint) {
    throw new Error(
      `No authorization endpoint found for ${integration.name}. OAuth discovery may have failed.`,
    );
  }

  const result = await startAuthorization(metadata.authorization_endpoint, {
    metadata,
    clientInformation: clientInfo,
    redirectUrl: redirectUri,
    scope: integration.scopes.join(" "),
    state,
    ...getResourceParam(integration),
  });

  logger.info("OAuth flow started", { integration: integration.name });

  return {
    url: result.authorizationUrl.toString(),
    codeVerifier: result.codeVerifier,
  };
}

/**
 * Complete OAuth flow - exchange authorization code for tokens
 * Saves tokens to database and returns them
 */
export async function handleOAuthCallback({
  integration,
  code,
  codeVerifier,
  redirectUri,
  emailAccountId,
}: {
  integration: ResolvedMcpIntegration;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  emailAccountId: string;
}): Promise<OAuthTokens> {
  if (!integration.serverUrl) {
    throw new Error(`No server URL configured for ${integration.name}`);
  }

  const clientInfo = await getOAuthClient(integration, redirectUri);
  const metadata = await discoverMetadata(integration);

  const tokens = await exchangeAuthorization(metadata.token_endpoint, {
    metadata,
    clientInformation: clientInfo,
    authorizationCode: code,
    codeVerifier,
    redirectUri,
    fetchFn: getMcpFetch(integration),
    ...getResourceParam(integration),
  });

  // A custom server row is owned by the account and may have been removed while
  // the user was on the provider's consent screen; never recreate it here
  const dbIntegration = integration.isCustom
    ? await prisma.mcpIntegration.findFirst({
        where: { name: integration.name, emailAccountId },
        select: { id: true },
      })
    : await prisma.mcpIntegration.upsert({
        where: { name: integration.name },
        update: {},
        create: { name: integration.name },
        select: { id: true },
      });

  if (!dbIntegration) {
    throw new Error(
      `Custom MCP server ${integration.name} was removed before the connection completed`,
    );
  }

  const expiresAt = calculateTokenExpiration(tokens.expires_in, {
    integration: integration.name,
    isRefresh: false,
  });

  await prisma.mcpConnection.upsert({
    where: {
      emailAccountId_integrationId: {
        emailAccountId,
        integrationId: dbIntegration.id,
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt,
      isActive: true,
    },
    create: {
      name: integration.name,
      emailAccountId,
      integrationId: dbIntegration.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt,
      isActive: true,
    },
  });

  logger.info("OAuth callback completed", {
    integration: integration.name,
    emailAccountId,
    hasRefreshToken: !!tokens.refresh_token,
  });

  return tokens;
}

/**
 * Get authentication token for an integration
 * Handles both OAuth (with auto-refresh) and API token authentication
 */
export async function getAuthToken({
  integration,
  emailAccountId,
}: {
  integration: ResolvedMcpIntegration;
  emailAccountId: string;
}): Promise<string> {
  if (integration.authType === "api-token") {
    const connection = await prisma.mcpConnection.findFirst({
      where: {
        emailAccountId,
        integration: { name: integration.name },
        isActive: true,
      },
      select: {
        apiKey: true,
      },
    });

    if (!connection?.apiKey) {
      throw new Error(
        `No API key found for ${integration.name}. Please configure the integration first.`,
      );
    }

    return connection.apiKey;
  }

  // OAuth flow
  return getValidAccessToken({ integration, emailAccountId });
}

/**
 * Get valid access token for an integration
 * Automatically refreshes if expired
 */
async function getValidAccessToken({
  integration,
  emailAccountId,
}: {
  integration: ResolvedMcpIntegration;
  emailAccountId: string;
}): Promise<string> {
  const connection = await prisma.mcpConnection.findFirst({
    where: {
      emailAccountId,
      integration: { name: integration.name },
      isActive: true,
    },
  });

  if (!connection?.accessToken) {
    throw new Error(
      `No access token found for ${integration.name}. Please connect the integration first.`,
    );
  }

  const isExpired =
    connection.expiresAt &&
    connection.expiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS < Date.now();

  if (isExpired && connection.refreshToken) {
    logger.info("Access token expired, refreshing", {
      integration: integration.name,
      emailAccountId,
    });

    const tokens = await refreshOAuthTokens({ integration, emailAccountId });
    return tokens.access_token;
  }

  if (isExpired) {
    // Without a refresh token the connection is permanently dead
    await deactivateConnection({ connectionId: connection.id, emailAccountId });
    throw new Error(
      `Access token for ${integration.name} has expired and no refresh token is available. Please reconnect.`,
    );
  }

  return connection.accessToken;
}

/**
 * Refresh OAuth tokens for an integration
 * Updates tokens in database and returns new tokens
 */
async function refreshOAuthTokens({
  integration,
  emailAccountId,
}: {
  integration: ResolvedMcpIntegration;
  emailAccountId: string;
}): Promise<OAuthTokens> {
  if (!integration.serverUrl) {
    throw new Error(`No server URL configured for ${integration.name}`);
  }

  const connection = await prisma.mcpConnection.findFirst({
    where: {
      emailAccountId,
      integration: { name: integration.name },
      isActive: true,
    },
    include: {
      integration: true,
    },
  });

  if (!connection?.refreshToken) {
    throw new Error(
      `No refresh token found for ${integration.name} connection ${emailAccountId}`,
    );
  }

  const clientInfo = await getOAuthClient(integration);
  const metadata = await discoverMetadata(integration);

  let tokens: OAuthTokens;
  try {
    tokens = await refreshAuthorization(metadata.token_endpoint, {
      metadata,
      clientInformation: clientInfo,
      refreshToken: connection.refreshToken,
      fetchFn: getMcpFetch(integration),
      ...getResourceParam(integration),
    });
  } catch (error) {
    // The grant was revoked or the client is no longer valid - retrying will
    // never succeed, so deactivate the connection until the user reconnects
    if (
      error instanceof InvalidGrantError ||
      error instanceof InvalidClientError
    ) {
      logger.warn("OAuth grant no longer valid, deactivating connection", {
        error,
        integration: integration.name,
        emailAccountId,
      });
      await deactivateConnection({
        connectionId: connection.id,
        emailAccountId,
      });
      if (error instanceof InvalidClientError) {
        // The registered OAuth client itself was rejected - clear it so the
        // next connect attempt re-registers instead of reusing the bad client
        await clearRegisteredClient(integration.name);
      }
      throw new Error(
        `The ${integration.displayName} connection is no longer authorized. Please reconnect.`,
      );
    }
    throw error;
  }

  const expiresAt = calculateTokenExpiration(tokens.expires_in, {
    integration: integration.name,
    isRefresh: true,
  });

  await prisma.mcpConnection.update({
    where: { id: connection.id, emailAccountId },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || connection.refreshToken,
      expiresAt,
    },
  });

  logger.info("OAuth tokens refreshed", {
    integration: integration.name,
    emailAccountId,
  });

  return tokens;
}

/**
 * Discover OAuth metadata for an integration
 * Caches discovered metadata in the database for performance
 * Falls back to static oauthConfig if auto-discovery fails
 */
async function discoverMetadata(
  integration: ResolvedMcpIntegration,
): Promise<AuthorizationServerMetadata> {
  const name = integration.name;
  const fetchFn = getMcpFetch(integration);
  const serverUrl = getOAuthServerUrl(integration);

  // Check cache first
  const stored = await prisma.mcpIntegration.findUnique({
    where: { name },
    select: {
      oauthClientId: true,
      registeredAuthorizationUrl: true,
      registeredTokenUrl: true,
      registeredServerUrl: true,
    },
  });

  // Cached endpoints omit registration metadata, so only reuse them after registration succeeds.
  if (
    stored?.oauthClientId &&
    stored.registeredAuthorizationUrl &&
    stored?.registeredTokenUrl &&
    stored.registeredServerUrl === serverUrl
  ) {
    logger.info("Using cached OAuth metadata", { integration: name });

    return createAuthServerMetadata(
      serverUrl,
      stored.registeredAuthorizationUrl,
      stored.registeredTokenUrl,
    );
  }

  // Discover via RFC 8414/9728
  logger.info("Discovering OAuth metadata from server", {
    integration: name,
    serverUrl,
  });

  try {
    let authServerUrl = serverUrl;

    // First try protected resource metadata (RFC 9728) - optional
    try {
      const resourceMetadata = await discoverOAuthProtectedResourceMetadata(
        serverUrl,
        undefined,
        fetchFn,
      );
      if (resourceMetadata?.authorization_servers?.[0]) {
        authServerUrl = resourceMetadata.authorization_servers[0];
        logger.info("Found auth server via protected resource metadata", {
          integration: name,
          authServerUrl,
        });
      }
    } catch {
      // Protected resource metadata is optional - many servers don't implement it
      logger.info(
        "Protected resource metadata not available, using server URL directly",
        { integration: name, serverUrl },
      );
    }

    // Then discover authorization server metadata (RFC 8414) - required
    const metadata = await discoverAuthorizationServerMetadata(authServerUrl, {
      fetchFn,
    });

    if (!metadata) {
      throw new Error("OAuth metadata discovery returned no results");
    }

    // Cache the discovered endpoints for next time
    await upsertMcpIntegration(name, {
      registeredAuthorizationUrl: metadata.authorization_endpoint,
      registeredTokenUrl: metadata.token_endpoint,
      registeredServerUrl: serverUrl,
    });

    logger.info("OAuth metadata discovered and cached", {
      integration: name,
      authEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      registrationEndpoint: metadata.registration_endpoint,
    });

    return metadata;
  } catch (error) {
    logger.warn("Failed to discover OAuth metadata, trying fallback config", {
      error,
      integration: name,
    });

    // Fallback to static oauthConfig if discovery fails
    if (integration.oauthConfig) {
      logger.info("Using static OAuth config fallback", {
        integration: name,
        authEndpoint: integration.oauthConfig.authorization_endpoint,
      });

      const metadata = createAuthServerMetadata(
        serverUrl,
        integration.oauthConfig.authorization_endpoint,
        integration.oauthConfig.token_endpoint,
        integration.oauthConfig.registration_endpoint,
      );

      await upsertMcpIntegration(name, {
        registeredAuthorizationUrl: metadata.authorization_endpoint,
        registeredTokenUrl: metadata.token_endpoint,
        registeredServerUrl: serverUrl,
      });

      return metadata;
    }

    logger.error("No fallback OAuth config available", {
      error,
      integration: name,
    });
    throw new Error(
      `Could not discover OAuth endpoints for ${name}. Server may not support OAuth discovery and no fallback config is available.`,
    );
  }
}

/**
 * Get OAuth client credentials for an integration
 * Uses stored credentials if available, otherwise dynamically registers
 */
async function getOAuthClient(
  integration: ResolvedMcpIntegration,
  redirectUri?: string,
): Promise<OAuthClientInformation> {
  const name = integration.name;

  // Check if we have dynamically registered credentials in DB
  const stored = await prisma.mcpIntegration.findUnique({
    where: { name },
    select: {
      oauthClientId: true,
      oauthClientSecret: true,
    },
  });

  if (stored?.oauthClientId) {
    logger.info("Using stored OAuth credentials", { integration: name });
    return {
      client_id: stored.oauthClientId,
      client_secret: stored.oauthClientSecret || undefined,
    };
  }

  if (!integration.serverUrl) {
    throw new Error(`No server URL configured for ${name}`);
  }

  if (!redirectUri) {
    throw new Error(
      `redirectUri is required for dynamic client registration for ${name}`,
    );
  }

  logger.info("Performing dynamic client registration", { integration: name });

  const metadata = await discoverMetadata(integration);

  if (!metadata.registration_endpoint) {
    throw new Error(
      `Dynamic registration not supported for ${name}. Please configure static OAuth credentials.`,
    );
  }

  const scope = integration.scopes.join(" ");

  const clientMetadata: OAuthClientMetadata = {
    client_name: "Inbox Zero",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // Public client with PKCE
    // Omit rather than send an empty string: some servers reject `scope: ""`
    // with invalid_scope instead of falling back to their defaults
    ...(scope && { scope }),
    logo_uri: "https://getinboxzero.com/icon.png",
    tos_uri: "https://getinboxzero.com/terms",
  };

  const registered = await registerClient(metadata.registration_endpoint, {
    metadata,
    clientMetadata,
    fetchFn: getMcpFetch(integration),
  });

  await upsertMcpIntegration(name, {
    oauthClientId: registered.client_id,
    oauthClientSecret: registered.client_secret,
  });

  logger.info("Dynamic client registration successful", {
    integration: name,
    clientId: registered.client_id,
  });

  return {
    client_id: registered.client_id,
    client_secret: registered.client_secret,
  };
}

async function upsertMcpIntegration(
  integration: string,
  data: {
    registeredAuthorizationUrl?: string;
    registeredTokenUrl?: string;
    registeredServerUrl?: string;
    oauthClientId?: string;
    oauthClientSecret?: string | null;
  },
) {
  return prisma.mcpIntegration.upsert({
    where: { name: integration },
    update: data,
    create: { name: integration, ...data },
  });
}

function createAuthServerMetadata(
  issuer: string,
  authorizationEndpoint: string,
  tokenEndpoint: string,
  registrationEndpoint?: string,
): AuthorizationServerMetadata {
  return {
    issuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    ...(registrationEndpoint && {
      registration_endpoint: registrationEndpoint,
    }),
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256", "plain"],
  };
}

function calculateTokenExpiration(
  expiresIn: number | undefined,
  context?: { integration: string; isRefresh?: boolean },
): Date {
  if (expiresIn) {
    return new Date(Date.now() + expiresIn * 1000);
  }

  // OAuth provider didn't return expires_in - use conservative default
  logger.warn(
    "OAuth provider did not return expires_in, using default expiry",
    {
      integration: context?.integration,
      isRefresh: context?.isRefresh ?? false,
      defaultExpiryMs: DEFAULT_TOKEN_EXPIRY_MS,
    },
  );

  return new Date(Date.now() + DEFAULT_TOKEN_EXPIRY_MS);
}

function getOAuthServerUrl(integration: ResolvedMcpIntegration): string {
  const serverUrl = integration.serverUrl || "";

  // If serverUrl ends with /mcp, OAuth discovery is at the base URL
  // This is the standard pattern: OAuth at https://mcp.example.com, MCP protocol at https://mcp.example.com/mcp
  if (serverUrl.endsWith("/mcp")) {
    return serverUrl.slice(0, -4);
  }

  return serverUrl;
}

/**
 * Returns the resource parameter for OAuth requests if supported by the integration.
 * Some OAuth servers (e.g., Pipedream) don't support RFC 8707 resource parameter.
 */
function getResourceParam(
  integration: ResolvedMcpIntegration,
): { resource: URL } | Record<string, never> {
  if (integration.skipResourceParam || !integration.serverUrl) {
    return {};
  }
  return { resource: new URL(integration.serverUrl) };
}

async function deactivateConnection({
  connectionId,
  emailAccountId,
}: {
  connectionId: string;
  emailAccountId: string;
}) {
  try {
    await prisma.mcpConnection.update({
      where: { id: connectionId, emailAccountId },
      data: { isActive: false },
    });
  } catch (error) {
    logger.error("Failed to deactivate MCP connection", {
      error,
      connectionId,
      emailAccountId,
    });
  }
}

async function clearRegisteredClient(integration: string) {
  try {
    // Also clear the cached discovery metadata: the cached variant omits the
    // registration endpoint, which fresh dynamic registration needs
    await prisma.mcpIntegration.update({
      where: { name: integration },
      data: {
        oauthClientId: null,
        oauthClientSecret: null,
        registeredAuthorizationUrl: null,
        registeredTokenUrl: null,
        registeredServerUrl: null,
      },
    });
  } catch (error) {
    logger.error("Failed to clear registered OAuth client", {
      error,
      integration,
    });
  }
}
