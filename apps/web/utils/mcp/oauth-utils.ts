import { env } from "@/env";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import { generateOAuthState } from "@/utils/oauth/state";
import { generatePKCEPair } from "@/utils/oauth/pkce";

/**
 * Get OAuth configuration for an MCP integration
 */
export function getMcpOAuthConfig(integration: IntegrationKey) {
  const integrationConfig = MCP_INTEGRATIONS[integration];

  if (!integrationConfig || integrationConfig.authType !== "oauth") {
    throw new Error(`Integration ${integration} does not support OAuth`);
  }

  if (!integrationConfig.oauthConfig) {
    throw new Error(`OAuth configuration missing for ${integration}`);
  }

  return integrationConfig.oauthConfig;
}

/**
 * Get environment variable names for an MCP integration
 */
export function getMcpEnvVars(integration: IntegrationKey) {
  const upperName = integration.toUpperCase();
  return {
    clientId: `${upperName}_MCP_CLIENT_ID` as keyof typeof env,
    clientSecret: `${upperName}_MCP_CLIENT_SECRET` as keyof typeof env,
  };
}

/**
 * Get OAuth client credentials for an MCP integration
 */
export function getMcpClientCredentials(integration: IntegrationKey) {
  const envVars = getMcpEnvVars(integration);

  const clientId = env[envVars.clientId] as string | undefined;
  const clientSecret = env[envVars.clientSecret] as string | undefined;

  if (!clientId) {
    throw new Error(`${envVars.clientId} environment variable not configured`);
  }

  return { clientId, clientSecret };
}

/**
 * Get cookie names for OAuth state management
 */
export function getMcpOAuthCookieNames(integration: IntegrationKey) {
  return {
    state: `${integration}_mcp_oauth_state`,
    pkce: `${integration}_mcp_pkce_verifier`,
  };
}

/**
 * Generate OAuth authorization URL for an MCP integration
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
  const oauthConfig = getMcpOAuthConfig(integration);
  const { clientId } = getMcpClientCredentials(integration);

  // Generate PKCE values
  const { codeVerifier, codeChallenge } = await generatePKCEPair();

  // Generate OAuth state with context
  const state = generateOAuthState({
    userId,
    emailAccountId,
    type: `${integration}-mcp`,
  });

  // Build authorization URL
  const authUrl = new URL(oauthConfig.authUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set(
    "redirect_uri",
    `${baseUrl}/api/mcp/${integration}/callback`,
  );
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

/**
 * Exchange OAuth code for tokens
 */
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
  const { clientId, clientSecret } = getMcpClientCredentials(integration);

  const tokenRequestBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${baseUrl}/api/mcp/${integration}/callback`,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  // Add client secret if available
  if (clientSecret) {
    tokenRequestBody.set("client_secret", clientSecret);
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

/**
 * Refresh OAuth access token for an MCP integration
 */
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
  const { clientId, clientSecret } = getMcpClientCredentials(integration);

  const tokenRequestBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  if (clientSecret) {
    tokenRequestBody.set("client_secret", clientSecret);
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
