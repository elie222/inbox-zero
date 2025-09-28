import { env } from "@/env";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import { generateOAuthState } from "@/utils/oauth/state";
import { generatePKCEPair } from "@/utils/oauth/pkce";

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
    case "stripe":
      return {
        clientId: env.STRIPE_MCP_CLIENT_ID,
        clientSecret: env.STRIPE_MCP_CLIENT_SECRET,
      };
    default:
      throw new Error(`Integration ${integration} does not support OAuth`);
  }
}

function getMcpClientCredentials(integration: IntegrationKey) {
  const { clientId, clientSecret } = getMcpEnvVars(integration);

  if (!clientId)
    throw new Error(
      `${integration} clientId environment variable not configured`,
    );
  if (!clientSecret)
    throw new Error(
      `${integration} clientSecret environment variable not configured`,
    );

  return { clientId, clientSecret };
}

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

  const { codeVerifier, codeChallenge } = await generatePKCEPair();

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
