import { NextResponse } from "next/server";
import { env } from "@/env";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import {
  oauthStateCookieOptions,
  getMcpPkceCookieName,
  getMcpStateCookieName,
  getMcpOAuthStateType,
  generateSignedOAuthState,
} from "@/utils/oauth/state";
import { findIntegration } from "@/utils/mcp/integrations";
import { generateOAuthUrl } from "@/utils/mcp/oauth";
import {
  getUserTier,
  hasTierAccess,
  premiumEntitlementSelect,
} from "@/utils/premium";
import prisma from "@/utils/prisma";

export type GetMcpAuthUrlResponse = { url: string };

export const GET = withEmailAccount(
  "mcp/auth-url",
  async (request, { params }) => {
    const { integration } = await params;
    const { emailAccountId } = request.auth;
    const userId = request.auth.userId;

    const logger = request.logger.with({
      integration,
    });

    // Check premium tier - integrations require Plus or higher
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: premiumEntitlementSelect,
        },
      },
    });

    const tier = getUserTier(user?.premium);

    if (!hasTierAccess({ tier, minimumTier: "PLUS_MONTHLY" })) {
      logger.warn("MCP auth URL rejected: tier too low", { tier });
      throw new SafeError(
        "Integrations require a Plus plan or higher. Please upgrade to continue.",
      );
    }

    const integrationConfig = findIntegration(integration);

    if (!integrationConfig) {
      logger.warn("MCP auth URL rejected: unknown integration");
      throw new SafeError(`Integration ${integration} not found`);
    }

    if (integrationConfig.authType !== "oauth") {
      logger.warn("MCP auth URL rejected: integration is not OAuth", {
        authType: integrationConfig.authType,
      });
      throw new SafeError(`Integration ${integration} does not support OAuth`);
    }

    try {
      const redirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/mcp/${integration}/callback`;

      const state = generateSignedOAuthState({
        userId,
        emailAccountId,
        type: getMcpOAuthStateType(integration),
      });

      const { url, codeVerifier } = await generateOAuthUrl({
        integration,
        redirectUri,
        state,
      });

      logger.info("Generated MCP auth URL");

      // Set secure cookies for state and PKCE verifier
      const response = NextResponse.json<GetMcpAuthUrlResponse>({ url });

      const maxAge = 60 * 10; // 10 minutes

      response.cookies.set(getMcpStateCookieName(integration), state, {
        ...oauthStateCookieOptions,
        maxAge,
      });

      response.cookies.set(getMcpPkceCookieName(integration), codeVerifier, {
        ...oauthStateCookieOptions,
        maxAge,
      });

      return response;
    } catch (error) {
      logger.error("Failed to generate MCP auth URL", { error });
      throw new SafeError("Failed to generate authorization URL");
    }
  },
);
