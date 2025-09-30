import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { parseOAuthState } from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import {
  exchangeMcpCodeForTokens,
  getMcpOAuthCookieNames,
} from "@/utils/mcp/oauth-utils";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";
import { syncMcpTools } from "@/utils/mcp/sync-tools";

const logger = createScopedLogger("mcp/callback");

export const GET = withError(async (request: NextRequest, { params }) => {
  const { integration } = await params;

  const integrationConfig = MCP_INTEGRATIONS[integration];

  if (!integrationConfig) {
    throw new SafeError(`Integration ${integration} not found`);
  }

  if (integrationConfig.authType !== "oauth") {
    throw new SafeError(`Integration ${integration} does not support OAuth`);
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const cookieNames = getMcpOAuthCookieNames(integration);
  const storedState = request.cookies.get(cookieNames.state)?.value;
  const storedCodeVerifier = request.cookies.get(cookieNames.pkce)?.value;

  // Default redirect - will be updated once we decode state
  let redirectUrl = new URL("/integrations", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  // Clean up cookies
  response.cookies.delete(cookieNames.state);
  response.cookies.delete(cookieNames.pkce);

  // Handle OAuth errors
  if (error) {
    logger.warn("OAuth error in MCP callback", {
      integration,
      error,
      errorDescription,
    });
    redirectUrl.searchParams.set(
      "error",
      error === "access_denied" ? "cancelled" : "oauth_error",
    );
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!code) {
    logger.warn("Missing code in MCP callback", { integration });
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during MCP callback", {
      integration,
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!storedCodeVerifier) {
    logger.warn("Missing PKCE verifier during MCP callback", { integration });
    redirectUrl.searchParams.set("error", "missing_pkce");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  // Decode and validate state
  let decodedState: {
    userId: string;
    emailAccountId: string;
    type: string;
    nonce: string;
  };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error, integration });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (decodedState.type !== `${integration}-mcp`) {
    logger.error("Invalid state type for MCP callback", {
      integration,
      expectedType: `${integration}-mcp`,
      actualType: decodedState.type,
    });
    redirectUrl.searchParams.set("error", "invalid_state_type");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const { userId, emailAccountId } = decodedState;

  // Update redirect URL to include emailAccountId
  redirectUrl = new URL(
    prefixPath(emailAccountId, "/integrations"),
    request.nextUrl.origin,
  );

  // Verify user owns this email account
  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      userId: userId,
    },
    select: { id: true },
  });

  if (!emailAccount) {
    logger.warn("Unauthorized MCP callback - invalid email account", {
      integration,
      emailAccountId,
      userId,
    });
    redirectUrl.searchParams.set("error", "forbidden");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeMcpCodeForTokens(
      integration,
      code,
      storedCodeVerifier,
      env.NEXT_PUBLIC_BASE_URL,
    );

    // Store tokens in database
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    // Ensure the integration exists in the registry
    const dbIntegration = await prisma.mcpIntegration.upsert({
      where: { name: integration },
      update: {},
      create: {
        name: integration,
        displayName: integrationConfig.displayName,
        serverUrl: integrationConfig.serverUrl || "",
        authType: integrationConfig.authType,
        defaultScopes: integrationConfig.defaultScopes,
        isActive: true,
      },
    });

    // Create or update the connection
    await prisma.mcpConnection.upsert({
      where: {
        emailAccountId_integrationId: {
          emailAccountId,
          integrationId: dbIntegration.id,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        emailAccountId,
        integrationId: dbIntegration.id,
        name: `${integrationConfig.displayName} Connection`,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        approvedScopes: integrationConfig.defaultScopes,
        approvedTools: [],
        isActive: true,
      },
    });

    logger.info("Successfully connected MCP integration", {
      integration,
      userId,
      emailAccountId,
      hasRefreshToken: !!tokens.refresh_token,
      expiresAt,
    });

    // Automatically sync tools after successful connection
    try {
      const syncResult = await syncMcpTools(integration, emailAccountId);
      logger.info("Auto-synced tools after connection", {
        integration,
        emailAccountId,
        toolsCount: syncResult.toolsCount,
      });
    } catch (error) {
      logger.error("Failed to auto-sync tools after connection", {
        error,
        integration,
        emailAccountId,
      });
      // Don't fail the connection if sync fails - user can retry manually
    }

    redirectUrl.searchParams.set("connected", integration);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    logger.error("Error during MCP token exchange", {
      error,
      integration,
      userId,
      emailAccountId,
    });
    redirectUrl.searchParams.set("error", "connection_failed");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
