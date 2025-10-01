import { type NextRequest, NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import {
  getMcpPkceCookieName,
  getMcpStateCookieName,
  parseOAuthState,
  getMcpOAuthStateType,
} from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";
import { getIntegration } from "@/utils/mcp/integrations";
import { syncMcpTools } from "@/utils/mcp/sync-tools";
import { handleOAuthCallback } from "@/utils/mcp/oauth";

const logger = createScopedLogger("mcp/callback");

export const GET = withError(async (request: NextRequest, { params }) => {
  const { integration } = await params;

  const integrationConfig = getIntegration(integration);

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

  const mcpStateCookieName = getMcpStateCookieName(integration);
  const mcpPkceCookieName = getMcpPkceCookieName(integration);

  const storedState = request.cookies.get(mcpStateCookieName)?.value;
  const storedCodeVerifier = request.cookies.get(mcpPkceCookieName)?.value;

  // Default redirect - will be updated once we decode state
  let redirectUrl = new URL("/integrations", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  // Clean up cookies
  response.cookies.delete(mcpStateCookieName);
  response.cookies.delete(mcpPkceCookieName);

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

  const expectedStateType = getMcpOAuthStateType(integration);
  if (decodedState.type !== expectedStateType) {
    logger.error("Invalid state type for MCP callback", {
      integration,
      expectedType: expectedStateType,
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
    // Exchange authorization code for tokens and save to DB
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/mcp/${integration}/callback`;

    await handleOAuthCallback({
      integration,
      code,
      codeVerifier: storedCodeVerifier,
      redirectUri,
      emailAccountId,
    });

    logger.info("Successfully connected MCP integration", {
      integration,
      userId,
      emailAccountId,
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
