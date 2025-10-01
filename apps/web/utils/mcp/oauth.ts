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
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getIntegration, getStaticCredentials } from "./integrations";
import type { IntegrationKey } from "./integrations";

const logger = createScopedLogger("mcp-oauth");

/**
 * Discover OAuth metadata for an integration
 * Caches discovered metadata in the database for performance
 * Falls back to static oauthConfig if auto-discovery fails
 */
async function discoverMetadata(
  serverUrl: string,
  integration: string,
): Promise<AuthorizationServerMetadata> {
  const integrationConfig = getIntegration(integration);

  // Check cache first
  const stored = await prisma.mcpIntegration.findUnique({
    where: { name: integration },
    select: {
      registeredAuthorizationUrl: true,
      registeredTokenUrl: true,
      registeredServerUrl: true,
    },
  });

  // Use cached endpoints if we have them AND they match the current serverUrl
  if (
    stored?.registeredAuthorizationUrl &&
    stored?.registeredTokenUrl &&
    stored.registeredServerUrl === serverUrl
  ) {
    logger.info("Using cached OAuth metadata", { integration });

    return {
      issuer: serverUrl,
      authorization_endpoint: stored.registeredAuthorizationUrl,
      token_endpoint: stored.registeredTokenUrl,
      grant_types_supported: ["authorization_code", "refresh_token"],
      response_types_supported: ["code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256", "plain"],
    } as AuthorizationServerMetadata;
  }

  // Discover via RFC 8414/9728
  logger.info("Discovering OAuth metadata from server", {
    integration,
    serverUrl,
  });

  try {
    let authServerUrl = serverUrl;

    // First try protected resource metadata (RFC 9728) - optional
    try {
      const resourceMetadata =
        await discoverOAuthProtectedResourceMetadata(serverUrl);
      if (resourceMetadata?.authorization_servers?.[0]) {
        authServerUrl = resourceMetadata.authorization_servers[0];
        logger.info("Found auth server via protected resource metadata", {
          integration,
          authServerUrl,
        });
      }
    } catch {
      // Protected resource metadata is optional - many servers don't implement it
      logger.info(
        "Protected resource metadata not available, using server URL directly",
        { integration, serverUrl },
      );
    }

    // Then discover authorization server metadata (RFC 8414) - required
    const metadata = await discoverAuthorizationServerMetadata(authServerUrl);

    if (!metadata) {
      throw new Error("OAuth metadata discovery returned no results");
    }

    // Cache the discovered endpoints for next time
    await prisma.mcpIntegration.upsert({
      where: { name: integration },
      update: {
        registeredAuthorizationUrl: metadata.authorization_endpoint,
        registeredTokenUrl: metadata.token_endpoint,
        registeredServerUrl: serverUrl,
      },
      create: {
        name: integration,
        registeredAuthorizationUrl: metadata.authorization_endpoint,
        registeredTokenUrl: metadata.token_endpoint,
        registeredServerUrl: serverUrl,
      },
    });

    logger.info("OAuth metadata discovered and cached", {
      integration,
      authEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      registrationEndpoint: metadata.registration_endpoint,
    });

    return metadata;
  } catch (error) {
    logger.warn("Failed to discover OAuth metadata, trying fallback config", {
      error,
      integration,
    });

    // Fallback to static oauthConfig if discovery fails
    if (integrationConfig.oauthConfig) {
      logger.info("Using static OAuth config fallback", {
        integration,
        authEndpoint: integrationConfig.oauthConfig.authorization_endpoint,
      });

      const metadata: AuthorizationServerMetadata = {
        issuer: serverUrl,
        authorization_endpoint:
          integrationConfig.oauthConfig.authorization_endpoint,
        token_endpoint: integrationConfig.oauthConfig.token_endpoint,
        registration_endpoint:
          integrationConfig.oauthConfig.registration_endpoint,
        grant_types_supported: ["authorization_code", "refresh_token"],
        response_types_supported: ["code"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256", "plain"],
      };

      await prisma.mcpIntegration.upsert({
        where: { name: integration },
        update: {
          registeredAuthorizationUrl: metadata.authorization_endpoint,
          registeredTokenUrl: metadata.token_endpoint,
          registeredServerUrl: serverUrl,
        },
        create: {
          name: integration,
          registeredAuthorizationUrl: metadata.authorization_endpoint,
          registeredTokenUrl: metadata.token_endpoint,
          registeredServerUrl: serverUrl,
        },
      });

      return metadata;
    }

    logger.error("No fallback OAuth config available", { error, integration });
    throw new Error(
      `Could not discover OAuth endpoints for ${integration}. Server may not support OAuth discovery and no fallback config is available.`,
    );
  }
}

/**
 * Get OAuth client credentials for an integration
 * Uses static credentials if available, otherwise dynamically registers
 */
async function getOAuthClient(
  integration: IntegrationKey,
  redirectUri: string,
): Promise<OAuthClientInformation> {
  const integrationConfig = getIntegration(integration);
  const staticCreds = getStaticCredentials(integration);

  // Use static credentials if available
  if (staticCreds?.clientId) {
    logger.info("Using static OAuth credentials", { integration });
    return {
      client_id: staticCreds.clientId,
      client_secret: staticCreds.clientSecret,
    };
  }

  // Check if we have dynamically registered credentials in DB
  const stored = await prisma.mcpIntegration.findUnique({
    where: { name: integration },
    select: {
      oauthClientId: true,
      oauthClientSecret: true,
    },
  });

  if (stored?.oauthClientId) {
    logger.info("Using stored OAuth credentials", { integration });
    return {
      client_id: stored.oauthClientId,
      client_secret: stored.oauthClientSecret || undefined,
    };
  }

  if (!integrationConfig.serverUrl) {
    throw new Error(`No server URL configured for ${integration}`);
  }

  logger.info("Performing dynamic client registration", { integration });

  const oauthServerUrl = getOAuthServerUrl(integrationConfig);
  const metadata = await discoverMetadata(oauthServerUrl, integration);

  if (!metadata.registration_endpoint) {
    throw new Error(
      `Dynamic registration not supported for ${integration}. Please configure static OAuth credentials.`,
    );
  }

  const clientMetadata: OAuthClientMetadata = {
    client_name: `Inbox Zero - ${integration}`,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // Public client with PKCE
    scope: integrationConfig.scopes.join(" "),
  };

  const registered = await registerClient(metadata.registration_endpoint, {
    metadata,
    clientMetadata,
  });

  await prisma.mcpIntegration.upsert({
    where: { name: integration },
    update: {
      oauthClientId: registered.client_id,
      oauthClientSecret: registered.client_secret,
    },
    create: {
      name: integration,
      oauthClientId: registered.client_id,
      oauthClientSecret: registered.client_secret,
    },
  });

  logger.info("Dynamic client registration successful", {
    integration,
    clientId: registered.client_id,
  });

  return {
    client_id: registered.client_id,
    client_secret: registered.client_secret,
  };
}

/**
 * Start OAuth flow - generate authorization URL with PKCE
 * Returns the URL to redirect to and the code verifier to save in cookies
 */
export async function generateOAuthUrl({
  integration,
  redirectUri,
  state,
}: {
  integration: IntegrationKey;
  redirectUri: string;
  state: string;
}): Promise<{
  url: string;
  codeVerifier: string;
}> {
  const integrationConfig = getIntegration(integration);

  if (!integrationConfig.serverUrl) {
    throw new Error(`No server URL configured for ${integration}`);
  }

  const clientInfo = await getOAuthClient(integration, redirectUri);
  const oauthServerUrl = getOAuthServerUrl(integrationConfig);
  const metadata = await discoverMetadata(oauthServerUrl, integration);

  if (!metadata.authorization_endpoint) {
    throw new Error(
      `No authorization endpoint found for ${integration}. OAuth discovery may have failed.`,
    );
  }

  const result = await startAuthorization(metadata.authorization_endpoint, {
    metadata,
    clientInformation: clientInfo,
    redirectUrl: redirectUri,
    scope: integrationConfig.scopes.join(" "),
    state,
    resource: new URL(integrationConfig.serverUrl),
  });

  logger.info("OAuth flow started", { integration });

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
  integration: IntegrationKey;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  emailAccountId: string;
}): Promise<OAuthTokens> {
  const integrationConfig = getIntegration(integration);

  if (!integrationConfig.serverUrl) {
    throw new Error(`No server URL configured for ${integration}`);
  }

  const clientInfo = await getOAuthClient(integration, redirectUri);
  const oauthServerUrl = getOAuthServerUrl(integrationConfig);
  const metadata = await discoverMetadata(oauthServerUrl, integration);

  const tokens = await exchangeAuthorization(metadata.token_endpoint, {
    metadata,
    clientInformation: clientInfo,
    authorizationCode: code,
    codeVerifier,
    redirectUri,
    resource: new URL(integrationConfig.serverUrl),
  });

  const dbIntegration = await prisma.mcpIntegration.upsert({
    where: { name: integration },
    update: {},
    create: { name: integration },
  });

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

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
      updatedAt: new Date(),
    },
    create: {
      name: integration,
      emailAccountId,
      integrationId: dbIntegration.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt,
      isActive: true,
    },
  });

  logger.info("OAuth callback completed", {
    integration,
    emailAccountId,
    hasRefreshToken: !!tokens.refresh_token,
  });

  return tokens;
}

/**
 * Refresh OAuth tokens for an integration
 * Updates tokens in database and returns new tokens
 */
export async function refreshOAuthTokens({
  integration,
  emailAccountId,
}: {
  integration: IntegrationKey;
  emailAccountId: string;
}): Promise<OAuthTokens> {
  const integrationConfig = getIntegration(integration);

  if (!integrationConfig.serverUrl) {
    throw new Error(`No server URL configured for ${integration}`);
  }

  const connection = await prisma.mcpConnection.findFirst({
    where: {
      emailAccountId,
      integration: { name: integration },
      isActive: true,
    },
    include: {
      integration: true,
    },
  });

  if (!connection?.refreshToken) {
    throw new Error(
      `No refresh token found for ${integration} connection ${emailAccountId}`,
    );
  }

  const clientInfo = await getOAuthClient(
    integration,
    "", // redirectUri not needed for refresh
  );

  const oauthServerUrl = getOAuthServerUrl(integrationConfig);
  const metadata = await discoverMetadata(oauthServerUrl, integration);

  const tokens = await refreshAuthorization(metadata.token_endpoint, {
    metadata,
    clientInformation: clientInfo,
    refreshToken: connection.refreshToken,
    resource: new URL(integrationConfig.serverUrl),
  });

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : connection.expiresAt;

  await prisma.mcpConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || connection.refreshToken,
      expiresAt,
      updatedAt: new Date(),
    },
  });

  logger.info("OAuth tokens refreshed", {
    integration,
    emailAccountId,
  });

  return tokens;
}

/**
 * Get valid access token for an integration
 * Automatically refreshes if expired
 */
export async function getValidAccessToken({
  integration,
  emailAccountId,
}: {
  integration: IntegrationKey;
  emailAccountId: string;
}): Promise<string> {
  const connection = await prisma.mcpConnection.findFirst({
    where: {
      emailAccountId,
      integration: { name: integration },
      isActive: true,
    },
  });

  if (!connection?.accessToken) {
    throw new Error(
      `No access token found for ${integration}. Please connect the integration first.`,
    );
  }

  const now = new Date();
  const isExpired = connection.expiresAt && connection.expiresAt < now;

  if (isExpired && connection.refreshToken) {
    logger.info("Access token expired, refreshing", {
      integration,
      emailAccountId,
    });

    const tokens = await refreshOAuthTokens({ integration, emailAccountId });
    return tokens.access_token;
  }

  if (isExpired) {
    throw new Error(
      `Access token for ${integration} has expired and no refresh token is available. Please reconnect.`,
    );
  }

  return connection.accessToken;
}

/**
 * Get the OAuth server URL for discovery
 * If serverUrl ends with /mcp, strip it for OAuth discovery (standard MCP pattern)
 * Otherwise use serverUrl as-is
 */
function getOAuthServerUrl(
  integrationConfig: ReturnType<typeof getIntegration>,
): string {
  const serverUrl = integrationConfig.serverUrl || "";

  // If serverUrl ends with /mcp, OAuth discovery is at the base URL
  // This is the standard pattern: OAuth at https://mcp.example.com, MCP protocol at https://mcp.example.com/mcp
  if (serverUrl.endsWith("/mcp")) {
    return serverUrl.slice(0, -4);
  }

  return serverUrl;
}
