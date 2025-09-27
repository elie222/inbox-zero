import { NextResponse } from "next/server";
import { env } from "@/env";
import { withEmailAccount } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { oauthStateCookieOptions } from "@/utils/oauth/state";
import {
  generateMcpAuthUrl,
  getMcpOAuthCookieNames,
} from "@/utils/mcp/oauth-utils";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";

const logger = createScopedLogger("mcp/auth-url");

export type GetMcpAuthUrlResponse = { url: string };

export const GET = withEmailAccount(async (request, { params }) => {
  const { integration } = await params;
  const { emailAccountId } = request.auth;
  const userId = request.auth.userId;

  const logger_with_context = logger.with({ userId, integration });

  // Validate integration exists and supports OAuth
  if (!MCP_INTEGRATIONS[integration as IntegrationKey]) {
    throw new SafeError(`Unknown integration: ${integration}`);
  }

  const integrationConfig = MCP_INTEGRATIONS[integration as IntegrationKey];
  if (integrationConfig.authType !== "oauth") {
    throw new SafeError(`Integration ${integration} does not support OAuth`);
  }

  try {
    // Generate OAuth authorization URL
    const { url, state, codeVerifier } = await generateMcpAuthUrl(
      integration as IntegrationKey,
      emailAccountId,
      userId,
      env.NEXT_PUBLIC_BASE_URL,
    );

    const cookieNames = getMcpOAuthCookieNames(integration as IntegrationKey);

    // Set secure cookies for state and PKCE verifier
    const response = NextResponse.json<GetMcpAuthUrlResponse>({ url });

    response.cookies.set(cookieNames.state, state, {
      ...oauthStateCookieOptions,
      maxAge: 60 * 10, // 10 minutes
    });

    response.cookies.set(cookieNames.pkce, codeVerifier, {
      ...oauthStateCookieOptions,
      maxAge: 60 * 10, // 10 minutes
    });

    logger_with_context.info("Generated MCP auth URL", {
      emailAccountId,
      hasState: !!state,
      hasPKCE: !!codeVerifier,
    });

    return response;
  } catch (error) {
    logger_with_context.error("Failed to generate MCP auth URL", { error });
    throw new SafeError("Failed to generate authorization URL");
  }
});
