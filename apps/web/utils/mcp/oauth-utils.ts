/**
 * Updated MCP OAuth utilities using the @inboxzero/mcp package
 * This file replaces oauth-utils.ts with cleaner code using the reusable package
 */

import { env } from "@/env";
import {
  generateAuthorizationUrl as generateAuthUrl,
  exchangeCodeForTokens as exchangeCode,
  refreshAccessToken as refreshToken,
  type TokenResponse,
} from "@inboxzero/mcp";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import { generateOAuthState } from "@/utils/oauth/state";
import { credentialStorage } from "@/utils/mcp/storage-adapter";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("mcp-oauth");

/**
 * Get static OAuth client credentials from environment variables (if available)
 */
function getStaticCredentials(integration: IntegrationKey) {
  switch (integration) {
    case "notion":
      return {
        clientId: env.NOTION_MCP_CLIENT_ID,
        clientSecret: env.NOTION_MCP_CLIENT_SECRET,
      };
    case "hubspot":
      return {
        clientId: env.HUBSPOT_MCP_CLIENT_ID,
        clientSecret: env.HUBSPOT_MCP_CLIENT_SECRET,
      };
    case "monday":
      return {
        clientId: env.MONDAY_MCP_CLIENT_ID,
        clientSecret: env.MONDAY_MCP_CLIENT_SECRET,
      };
    default:
      return undefined;
  }
}

/**
 * Ensure the integration exists in the database
 */
async function ensureIntegrationExists(integration: IntegrationKey) {
  const integrationConfig = MCP_INTEGRATIONS[integration];

  await prisma.mcpIntegration.upsert({
    where: { name: integration },
    update: {
      displayName: integrationConfig.displayName,
      serverUrl: integrationConfig.serverUrl,
      authType: integrationConfig.authType,
      defaultScopes: integrationConfig.defaultScopes,
    },
    create: {
      name: integrationConfig.name,
      displayName: integrationConfig.displayName,
      serverUrl: integrationConfig.serverUrl,
      npmPackage: integrationConfig.npmPackage,
      authType: integrationConfig.authType,
      defaultScopes: integrationConfig.defaultScopes,
    },
  });
}

/**
 * Cookie names for storing OAuth state and PKCE verifier
 */
export function getMcpOAuthCookieNames(integration: IntegrationKey) {
  return {
    state: `${integration}_mcp_oauth_state`,
    pkce: `${integration}_mcp_pkce_verifier`,
  };
}

/**
 * Generate MCP OAuth authorization URL
 */
export async function generateMcpAuthUrl(
  integration: IntegrationKey,
  emailAccountId: string,
  userId: string,
  baseUrl: string,
): Promise<{
  url: string;
  state: string;
  codeVerifier: string;
}> {
  const integrationConfig = MCP_INTEGRATIONS[integration];
  const redirectUri = `${baseUrl}/api/mcp/${integration}/callback`;

  // Ensure integration exists in database
  await ensureIntegrationExists(integration);

  // Generate OAuth state
  const state = generateOAuthState({
    userId,
    emailAccountId,
    type: `${integration}-mcp`,
  });

  // Generate authorization URL using the package
  const { url, codeVerifier } = await generateAuthUrl(
    integrationConfig,
    redirectUri,
    state,
    credentialStorage,
    logger,
    getStaticCredentials(integration),
  );

  return {
    url,
    state,
    codeVerifier,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeMcpCodeForTokens(
  integration: IntegrationKey,
  code: string,
  codeVerifier: string,
  baseUrl: string,
): Promise<TokenResponse> {
  const integrationConfig = MCP_INTEGRATIONS[integration];
  const redirectUri = `${baseUrl}/api/mcp/${integration}/callback`;

  return await exchangeCode(
    integrationConfig,
    code,
    codeVerifier,
    redirectUri,
    credentialStorage,
    logger,
    getStaticCredentials(integration),
  );
}

/**
 * Refresh an expired access token
 */
export async function refreshMcpAccessToken(
  integration: IntegrationKey,
  refreshTokenValue: string,
): Promise<TokenResponse> {
  const integrationConfig = MCP_INTEGRATIONS[integration];

  return await refreshToken(
    integrationConfig,
    refreshTokenValue,
    credentialStorage,
    logger,
    getStaticCredentials(integration),
  );
}
