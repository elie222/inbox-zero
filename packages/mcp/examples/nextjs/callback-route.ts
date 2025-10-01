/**
 * Next.js App Router: Handle MCP OAuth Callback
 *
 * Route: app/api/mcp/[integration]/callback/route.ts
 *
 * This route handles the OAuth callback, validates state, exchanges the
 * authorization code for tokens, and stores them in your database.
 *
 * NOTE: This is an example file. Replace commented imports with your actual implementations.
 */

// biome-ignore-all lint: Example file with placeholder code

import { type NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@inboxzero/mcp";
import type { McpIntegrationConfig } from "@inboxzero/mcp";

// Import your implementations
// import { storage } from '@/lib/mcp/storage';
// import { MCP_INTEGRATIONS } from '@/lib/mcp/integrations';

// Example integration config
const MCP_INTEGRATIONS: Record<string, McpIntegrationConfig> = {
  notion: {
    name: "notion",
    displayName: "Notion",
    serverUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
    scopes: ["read"],
    oauthConfig: {
      authorization_endpoint: "https://mcp.notion.com/authorize",
      token_endpoint: "https://mcp.notion.com/token",
      registration_endpoint: "https://mcp.notion.com/register",
    },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integration: string }> },
) {
  const { integration } = await params;

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Get cookies
  const storedState = request.cookies.get(`${integration}_oauth_state`)?.value;
  const codeVerifier = request.cookies.get(
    `${integration}_pkce_verifier`,
  )?.value;

  // Redirect URL (update this to your integrations page)
  const redirectUrl = new URL("/integrations", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  // Clean up cookies immediately
  response.cookies.delete(`${integration}_oauth_state`);
  response.cookies.delete(`${integration}_pkce_verifier`);

  // Handle OAuth errors
  if (error) {
    console.warn("OAuth error:", error, errorDescription);
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  // Validate we have all required data
  if (!code) {
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!codeVerifier) {
    redirectUrl.searchParams.set("error", "missing_pkce");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  // Decode state to get user info
  let stateData: { userId: string; integration: string; timestamp: number };
  try {
    stateData = JSON.parse(Buffer.from(storedState, "base64url").toString());
  } catch {
    redirectUrl.searchParams.set("error", "invalid_state_format");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const { userId } = stateData;

  // Validate integration
  const integrationConfig = MCP_INTEGRATIONS[integration];
  if (!integrationConfig) {
    redirectUrl.searchParams.set("error", "unknown_integration");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/mcp/${integration}/callback`;

    // Exchange code for tokens using the package
    const tokens = await exchangeCodeForTokens(
      integrationConfig,
      code,
      codeVerifier,
      redirectUri,
      storage, // Your storage implementation
      console, // Optional: your logger
    );

    // Store tokens using your storage
    await storage.storeConnectionCredentials(integration, userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    });

    console.info("Successfully connected MCP integration", {
      integration,
      userId,
      hasRefreshToken: !!tokens.refresh_token,
    });

    // Redirect with success
    redirectUrl.searchParams.set("connected", integration);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    console.error("Error during token exchange:", error);
    redirectUrl.searchParams.set("error", "connection_failed");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
}
