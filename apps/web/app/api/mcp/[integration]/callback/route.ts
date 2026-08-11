import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import {
  getMcpPkceCookieName,
  getMcpStateCookieName,
  getMcpOAuthStateType,
  validateSignedOAuthState,
} from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";
import { findIntegration } from "@/utils/mcp/integrations";
import { syncMcpTools } from "@/utils/mcp/sync-tools";
import { handleOAuthCallback } from "@/utils/mcp/oauth";
import { env } from "@/env";
import {
  claimOAuthCodeAndWait,
  clearOAuthCode,
  isOAuthCodeStoreConfigured,
  setOAuthCodeResult,
  type OAuthCodeResult,
} from "@/utils/redis/oauth-code";
import type { Logger } from "@/utils/logger";

const CALLBACK_RESULT_TTL_SECONDS = 600;

export const GET = withError("mcp/callback", async (request, { params }) => {
  const logger = request.logger;
  const { integration } = await params;

  const integrationConfig = findIntegration(integration);

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

  const buildRedirectResponse = (target: URL) => {
    const nextResponse = NextResponse.redirect(target);
    nextResponse.cookies.delete(mcpStateCookieName);
    nextResponse.cookies.delete(mcpPkceCookieName);
    return nextResponse;
  };

  // Default redirect - will be updated once we decode state
  let redirectUrl = new URL("/integrations", env.NEXT_PUBLIC_BASE_URL);

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
    return buildRedirectResponse(redirectUrl);
  }

  if (!code) {
    logger.warn("Missing code in MCP callback", { integration });
    redirectUrl.searchParams.set("error", "missing_code");
    return buildRedirectResponse(redirectUrl);
  }

  const stateValidation = validateSignedOAuthState<{
    userId: string;
    emailAccountId: string;
    type: string;
  }>({
    receivedState,
    storedState,
  });
  if (!stateValidation.success) {
    logger.warn("Invalid state during MCP callback", {
      integration,
      receivedState,
      hasStoredState: !!storedState,
      error: stateValidation.error,
    });
    redirectUrl.searchParams.set("error", stateValidation.error);
    return buildRedirectResponse(redirectUrl);
  }

  if (!storedCodeVerifier) {
    logger.warn("Missing PKCE verifier during MCP callback", { integration });
    redirectUrl.searchParams.set("error", "missing_pkce");
    return buildRedirectResponse(redirectUrl);
  }

  const decodedState = stateValidation.state;

  if (
    typeof decodedState.userId !== "string" ||
    typeof decodedState.emailAccountId !== "string" ||
    typeof decodedState.type !== "string"
  ) {
    logger.error("Failed to decode state", { integration });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    return buildRedirectResponse(redirectUrl);
  }

  const expectedStateType = getMcpOAuthStateType(integration);
  if (decodedState.type !== expectedStateType) {
    logger.error("Invalid state type for MCP callback", {
      integration,
      expectedType: expectedStateType,
      actualType: decodedState.type,
    });
    redirectUrl.searchParams.set("error", "invalid_state_type");
    return buildRedirectResponse(redirectUrl);
  }

  const { userId, emailAccountId } = decodedState;

  // Update redirect URL to include emailAccountId
  redirectUrl = new URL(
    prefixPath(emailAccountId, "/integrations"),
    env.NEXT_PUBLIC_BASE_URL,
  );

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
    return buildRedirectResponse(redirectUrl);
  }

  if (isOAuthCodeStoreConfigured()) {
    const claim = await claimOAuthCodeAndWait(code);
    if (claim.status === "error") {
      logger.error("MCP OAuth callback deduplication unavailable", {
        error: claim.error,
        integration,
      });
      redirectUrl.searchParams.set("error", "connection_failed");
      return buildRedirectResponse(redirectUrl);
    }

    if (claim.status === "success") {
      logger.info(
        claim.waited
          ? "Reusing in-flight MCP OAuth callback result"
          : "Reusing completed MCP OAuth callback",
        { integration },
      );
      applyCallbackResult(redirectUrl, claim.result);
      return buildRedirectResponse(redirectUrl);
    }

    if (claim.status === "timeout") {
      logger.warn("MCP OAuth callback wait timed out", { integration });
      redirectUrl.searchParams.set("error", "connection_failed");
      return buildRedirectResponse(redirectUrl);
    }
  }

  try {
    // Exchange authorization code for tokens and save to DB
    const redirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/mcp/${integration}/callback`;

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

    try {
      const syncResult = await syncMcpTools(
        integration,
        emailAccountId,
        logger,
      );
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
      redirectUrl.searchParams.set("error", "tool_sync_failed");
      await cacheCallbackResult({
        code,
        integration,
        logger,
        params: { error: "tool_sync_failed" },
      });
      return buildRedirectResponse(redirectUrl);
    }

    redirectUrl.searchParams.set("connected", integration);
    await cacheCallbackResult({
      code,
      integration,
      logger,
      params: { connected: integration },
    });
    return buildRedirectResponse(redirectUrl);
  } catch (error) {
    if (isOAuthCodeStoreConfigured()) await clearOAuthCode(code);
    logger.error("Error during MCP token exchange", {
      error,
      integration,
      userId,
      emailAccountId,
    });
    redirectUrl.searchParams.set("error", "connection_failed");
    return buildRedirectResponse(redirectUrl);
  }
});

function applyCallbackResult(redirectUrl: URL, result: OAuthCodeResult) {
  for (const [key, value] of Object.entries(result.params)) {
    redirectUrl.searchParams.set(key, value);
  }
}

async function cacheCallbackResult({
  code,
  integration,
  logger,
  params,
}: {
  code: string;
  integration: string;
  logger: Logger;
  params: Record<string, string>;
}) {
  if (!isOAuthCodeStoreConfigured()) return;

  try {
    await setOAuthCodeResult(code, params, {
      ttlSeconds: CALLBACK_RESULT_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("Failed to cache MCP OAuth callback result", {
      error,
      integration,
    });
  }
}
