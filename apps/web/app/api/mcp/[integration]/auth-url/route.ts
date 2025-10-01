import { NextResponse } from "next/server";
import { env } from "@/env";
import { withEmailAccount } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { oauthStateCookieOptions } from "@/utils/oauth/state";
import { getMcpOAuthCookieNames } from "@/utils/mcp/oauth-utils";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";
import { generateAuthorizationUrl } from "@inboxzero/mcp";
import {
  type IntegrationKey,
  getStaticCredentials,
} from "@/utils/mcp/integrations";
import { generateOAuthState } from "@/utils/oauth/state";
import { credentialStorage } from "@/utils/mcp/storage-adapter";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("mcp/auth-url");

export type GetMcpAuthUrlResponse = { url: string };

export const GET = withEmailAccount(async (request, { params }) => {
  const { integration } = await params;
  const { emailAccountId } = request.auth;
  const userId = request.auth.userId;

  const logger_with_context = logger.with({ userId, integration });

  const integrationConfig = MCP_INTEGRATIONS[integration];

  if (!integrationConfig) {
    throw new SafeError(`Integration ${integration} not found`);
  }

  if (integrationConfig.authType !== "oauth") {
    throw new SafeError(`Integration ${integration} does not support OAuth`);
  }

  try {
    const { url, state, codeVerifier } = await generateMcpAuthUrl(
      integration,
      emailAccountId,
      userId,
      env.NEXT_PUBLIC_BASE_URL,
    );

    const cookieNames = getMcpOAuthCookieNames(integration);

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

async function generateMcpAuthUrl(
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

  await ensureIntegrationExists(integration);

  const state = generateOAuthState({
    userId,
    emailAccountId,
    type: `${integration}-mcp`,
  });

  const { url, codeVerifier } = await generateAuthorizationUrl(
    integrationConfig,
    redirectUri,
    state,
    credentialStorage,
    logger,
    getStaticCredentials(integration),
    "Inbox Zero",
  );

  return {
    url,
    state,
    codeVerifier,
  };
}

async function ensureIntegrationExists(integration: IntegrationKey) {
  const integrationConfig = MCP_INTEGRATIONS[integration];

  await prisma.mcpIntegration.upsert({
    where: { name: integration },
    update: {
      displayName: integrationConfig.displayName,
      serverUrl: integrationConfig.serverUrl,
      authType: integrationConfig.authType,
      defaultScopes: integrationConfig.scopes,
    },
    create: {
      name: integrationConfig.name,
      displayName: integrationConfig.displayName,
      serverUrl: integrationConfig.serverUrl,
      npmPackage: integrationConfig.npmPackage,
      authType: integrationConfig.authType,
      defaultScopes: integrationConfig.scopes,
    },
  });
}
