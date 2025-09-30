/**
 * Helper utilities for setting up MCP clients with proper authentication
 */

import type {
  McpIntegrationConfig,
  ConnectionCredentials,
  CredentialStorage,
  Logger,
} from "./types";
import { noopLogger } from "./logger";
import { refreshAccessToken } from "./oauth";

/**
 * Get a valid bearer token for an MCP integration
 * Automatically refreshes expired tokens if refresh token is available
 */
export async function getBearerToken(
  integration: McpIntegrationConfig,
  userId: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  options?: {
    autoRefresh?: boolean;
    staticCredentials?: { clientId?: string; clientSecret?: string };
  },
): Promise<string> {
  const credentials = await storage.getConnectionCredentials(
    integration.name,
    userId,
  );

  if (!credentials) {
    throw new Error(
      `No credentials found for ${integration.name}. Please authenticate first.`,
    );
  }

  switch (integration.authType) {
    case "api-token":
      return getBearerTokenFromApiKey(credentials, integration);
    case "oauth":
      return await getBearerTokenFromOAuth(
        credentials,
        integration,
        userId,
        storage,
        logger,
        options,
      );
    default:
      throw new Error(
        `Unsupported auth type '${integration.authType}' for ${integration.name}`,
      );
  }
}

/**
 * Get bearer token for API-token based connections
 */
function getBearerTokenFromApiKey(
  credentials: ConnectionCredentials,
  integration: McpIntegrationConfig,
): string {
  if (!credentials.apiKey) {
    throw new Error(`No API key found for ${integration.name} connection.`);
  }
  return credentials.apiKey;
}

/**
 * Get bearer token for OAuth-based connections, refreshing as needed
 */
async function getBearerTokenFromOAuth(
  credentials: ConnectionCredentials,
  integration: McpIntegrationConfig,
  userId: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  options?: {
    autoRefresh?: boolean;
    staticCredentials?: { clientId?: string; clientSecret?: string };
  },
): Promise<string> {
  if (!credentials.accessToken) {
    throw new Error(
      `No access token found for ${integration.name} connection.`,
    );
  }

  // Check if OAuth token is expired
  const now = new Date();
  const isExpired = credentials.expiresAt && credentials.expiresAt < now;

  if (isExpired && credentials.refreshToken && options?.autoRefresh !== false) {
    logger.info?.("Refreshing expired OAuth token", {
      integration: integration.name,
    });

    const refreshedToken = await refreshAccessToken(
      integration,
      credentials.refreshToken,
      storage,
      logger,
      options?.staticCredentials,
    );

    // Update the stored credentials
    await storage.updateConnectionCredentials(integration.name, userId, {
      accessToken: refreshedToken.access_token,
      refreshToken: refreshedToken.refresh_token || credentials.refreshToken,
      expiresAt: refreshedToken.expires_in
        ? new Date(Date.now() + refreshedToken.expires_in * 1000)
        : credentials.expiresAt,
    });

    return refreshedToken.access_token;
  }

  if (isExpired) {
    throw new Error(
      `${integration.name} OAuth token has expired. Please re-authenticate.`,
    );
  }

  return credentials.accessToken;
}

/**
 * Create headers for MCP HTTP transport
 * Use this when setting up StreamableHTTPClientTransport
 */
export async function createMcpHeaders(
  integration: McpIntegrationConfig,
  userId: string,
  storage: CredentialStorage,
  logger: Logger = noopLogger,
  options?: {
    autoRefresh?: boolean;
    staticCredentials?: { clientId?: string; clientSecret?: string };
  },
): Promise<Record<string, string>> {
  const bearerToken = await getBearerToken(
    integration,
    userId,
    storage,
    logger,
    options,
  );

  return {
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
  };
}
