/**
 * Next.js App Router: Generate MCP OAuth Authorization URL
 *
 * Route: app/api/mcp/[integration]/auth-url/route.ts
 *
 * This route generates an OAuth authorization URL with PKCE and stores
 * the state and code verifier in secure HttpOnly cookies.
 *
 * NOTE: This is an example file. Replace commented imports with your actual implementations.
 */

// biome-ignore-all lint: Example file with placeholder code

import { NextResponse } from "next/server";
import { generateAuthorizationUrl } from "@inboxzero/mcp";
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
  request: Request,
  { params }: { params: Promise<{ integration: string }> },
) {
  const { integration } = await params;

  // Validate integration exists
  const integrationConfig = MCP_INTEGRATIONS[integration];
  if (!integrationConfig) {
    return NextResponse.json(
      { error: `Unknown integration: ${integration}` },
      { status: 400 },
    );
  }

  if (integrationConfig.authType !== "oauth") {
    return NextResponse.json(
      { error: `Integration ${integration} does not support OAuth` },
      { status: 400 },
    );
  }

  try {
    // Get user ID from your auth system
    // const userId = await getUserId(request);
    const userId = "user-123"; // Replace with actual user ID

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/mcp/${integration}/callback`;

    // Generate state (you should implement this to prevent CSRF)
    // Include userId and any other data you need in the callback
    const state = Buffer.from(
      JSON.stringify({
        userId,
        integration,
        timestamp: Date.now(),
      }),
    ).toString("base64url");

    // Generate authorization URL
    // Storage and logger are required - pass your implementations
    const { url, codeVerifier } = await generateAuthorizationUrl(
      integrationConfig,
      redirectUri,
      state,
      storage, // Your storage implementation
      console, // Optional: your logger
    );

    // Store state and PKCE verifier in secure cookies
    const response = NextResponse.json({ url });

    // HttpOnly, Secure, SameSite=Lax cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    };

    response.cookies.set(`${integration}_oauth_state`, state, cookieOptions);
    response.cookies.set(
      `${integration}_pkce_verifier`,
      codeVerifier,
      cookieOptions,
    );

    return response;
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate authorization URL" },
      { status: 500 },
    );
  }
}
