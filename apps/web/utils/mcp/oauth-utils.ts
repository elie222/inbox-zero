import { env } from "@/env";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import { generateOAuthState } from "@/utils/oauth/state";
import { generatePKCEPair } from "@/utils/oauth/pkce";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-oauth");

function getMcpOAuthConfig(integration: IntegrationKey) {
  const integrationConfig = MCP_INTEGRATIONS[integration];

  if (!integrationConfig || integrationConfig.authType !== "oauth") {
    throw new Error(`Integration ${integration} does not support OAuth`);
  }

  if (!integrationConfig.oauthConfig) {
    throw new Error(`OAuth configuration missing for ${integration}`);
  }

  return integrationConfig.oauthConfig;
}

function getMcpEnvVars(integration: IntegrationKey) {
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
      // Return undefined for integrations without env vars (will use dynamic registration)
      return {
        clientId: undefined,
        clientSecret: undefined,
      };
  }
}

async function getMcpClientCredentials(integration: IntegrationKey): Promise<{
  clientId: string | undefined;
  clientSecret: string | undefined;
  isDynamic: boolean;
}> {
  const integrationConfig = MCP_INTEGRATIONS[integration];

  if (integrationConfig.authType !== "oauth") {
    throw new Error(`Integration ${integration} does not support OAuth`);
  }

  // First, try to get credentials from environment variables
  const envVars = getMcpEnvVars(integration);

  if (envVars.clientId && envVars.clientSecret) {
    // Static credentials from environment
    return {
      clientId: envVars.clientId,
      clientSecret: envVars.clientSecret,
      isDynamic: false,
    };
  }

  // No static credentials, check for dynamically registered credentials at integration level
  const mcpIntegration = await prisma.mcpIntegration.findUnique({
    where: {
      name: integration,
    },
  });

  if (mcpIntegration?.oauthClientId) {
    // Found dynamically registered credentials
    return {
      clientId: mcpIntegration.oauthClientId,
      clientSecret: mcpIntegration.oauthClientSecret || undefined,
      isDynamic: true,
    };
  }

  // No credentials available yet - will need dynamic registration
  return {
    clientId: undefined,
    clientSecret: undefined,
    isDynamic: true,
  };
}

/**
 * Performs dynamic client registration according to RFC7591
 * https://datatracker.ietf.org/doc/html/rfc7591
 */
async function performDynamicClientRegistration(
  integration: IntegrationKey,
  redirectUri: string,
): Promise<{
  clientId: string;
  clientSecret: string | undefined;
  isDynamic: boolean;
}> {
  const integrationConfig = MCP_INTEGRATIONS[integration];
  const oauthConfig = getMcpOAuthConfig(integration);

  if (!oauthConfig.registrationUrl) {
    throw new Error(
      `Dynamic client registration not supported for ${integration} - no registration URL configured`,
    );
  }

  logger.info("Performing dynamic client registration", {
    integration,
    registrationUrl: oauthConfig.registrationUrl,
  });

  // Prepare registration request according to RFC7591
  const registrationRequest = {
    client_name: `Inbox Zero - ${integrationConfig.displayName}`,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // Public client (PKCE provides security)
    application_type: "web",
    scope: integrationConfig.defaultScopes.join(" "),
  };

  const response = await fetch(oauthConfig.registrationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(registrationRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("Dynamic client registration failed", {
      integration,
      status: response.status,
      error,
    });
    throw new Error(
      `Dynamic client registration failed: ${response.status} ${error}`,
    );
  }

  const registrationResponse = await response.json();

  logger.info("Dynamic client registration successful", {
    integration,
    clientId: registrationResponse.client_id,
  });

  // Store the dynamically registered credentials at the integration level
  // Find or create the integration
  await prisma.mcpIntegration.upsert({
    where: { name: integration },
    update: {
      oauthClientId: registrationResponse.client_id,
      oauthClientSecret: registrationResponse.client_secret,
    },
    create: {
      name: integrationConfig.name,
      displayName: integrationConfig.displayName,
      description: integrationConfig.description,
      serverUrl: integrationConfig.serverUrl,
      npmPackage: integrationConfig.npmPackage,
      authType: integrationConfig.authType,
      defaultScopes: integrationConfig.defaultScopes,
      oauthClientId: registrationResponse.client_id,
      oauthClientSecret: registrationResponse.client_secret,
    },
  });

  logger.info("Stored dynamic client credentials at integration level", {
    integration,
  });

  return {
    clientId: registrationResponse.client_id,
    clientSecret: registrationResponse.client_secret || undefined,
    isDynamic: true,
  };
}

export function getMcpOAuthCookieNames(integration: IntegrationKey) {
  return {
    state: `${integration}_mcp_oauth_state`,
    pkce: `${integration}_mcp_pkce_verifier`,
  };
}

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
  const oauthConfig = getMcpOAuthConfig(integration);

  const redirectUri = `${baseUrl}/api/mcp/${integration}/callback`;

  // Get client credentials (static or dynamic) - these are shared across all users
  let credentials = await getMcpClientCredentials(integration);

  // If no client ID available, perform dynamic registration (once per integration)
  if (!credentials.clientId) {
    credentials = await performDynamicClientRegistration(
      integration,
      redirectUri,
    );
  }

  // At this point, credentials.clientId must exist
  if (!credentials.clientId) {
    throw new Error(
      `Failed to obtain client credentials for ${integration}. Neither static credentials nor dynamic registration succeeded.`,
    );
  }

  const { codeVerifier, codeChallenge } = await generatePKCEPair();

  const state = generateOAuthState({
    userId,
    emailAccountId,
    type: `${integration}-mcp`,
  });

  // Build authorization URL
  const authUrl = new URL(oauthConfig.authUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", integrationConfig.defaultScopes.join(" "));
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Add resource parameter if server URL is available (MCP requirement)
  if (integrationConfig.serverUrl) {
    const resourceUrl = new URL(integrationConfig.serverUrl);
    resourceUrl.pathname = ""; // Remove path, keep only origin
    authUrl.searchParams.set("resource", resourceUrl.toString());
  }

  authUrl.searchParams.set("state", state);

  return {
    url: authUrl.toString(),
    state,
    codeVerifier,
  };
}

export async function exchangeMcpCodeForTokens(
  integration: IntegrationKey,
  code: string,
  codeVerifier: string,
  baseUrl: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}> {
  const integrationConfig = MCP_INTEGRATIONS[integration];
  const oauthConfig = getMcpOAuthConfig(integration);
  const credentials = await getMcpClientCredentials(integration);

  if (!credentials.clientId) {
    throw new Error(
      `No client credentials available for ${integration}. This should not happen after auth flow.`,
    );
  }

  const tokenRequestBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${baseUrl}/api/mcp/${integration}/callback`,
    client_id: credentials.clientId,
    code_verifier: codeVerifier,
  });

  // Add client secret if available (for confidential clients)
  if (credentials.clientSecret) {
    tokenRequestBody.set("client_secret", credentials.clientSecret);
  }

  // Add resource parameter if server URL is available (MCP requirement)
  if (integrationConfig.serverUrl) {
    const resourceUrl = new URL(integrationConfig.serverUrl);
    resourceUrl.pathname = "";
    tokenRequestBody.set("resource", resourceUrl.toString());
  }

  const response = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenRequestBody,
  });

  const tokens = await response.json();

  if (!response.ok) {
    throw new Error(
      `Token exchange failed: ${tokens.error_description || tokens.error}`,
    );
  }

  return tokens;
}

export async function refreshMcpAccessToken(
  integration: IntegrationKey,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}> {
  const integrationConfig = MCP_INTEGRATIONS[integration];
  const oauthConfig = getMcpOAuthConfig(integration);
  const credentials = await getMcpClientCredentials(integration);

  if (!credentials.clientId) {
    throw new Error(
      `No client credentials available for ${integration}. Cannot refresh token.`,
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
  if (integrationConfig.serverUrl) {
    const resourceUrl = new URL(integrationConfig.serverUrl);
    resourceUrl.pathname = "";
    tokenRequestBody.set("resource", resourceUrl.toString());
  }

  const response = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenRequestBody,
  });

  const tokens = await response.json();

  if (!response.ok) {
    throw new Error(
      `Token refresh failed: ${tokens.error_description || tokens.error}`,
    );
  }

  return tokens;
}
