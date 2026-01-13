import { NextResponse } from "next/server";
import { env } from "@/env";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import {
  oauthStateCookieOptions,
  getMcpPkceCookieName,
  getMcpStateCookieName,
  getMcpOAuthStateType,
} from "@/utils/oauth/state";
import { getIntegration } from "@/utils/mcp/integrations";
import { generateOAuthState } from "@/utils/oauth/state";
import { generateOAuthUrl } from "@/utils/mcp/oauth";
import { hasTierAccess } from "@/utils/premium";
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

    // Check premium tier - integrations require Business Plus
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { premium: { select: { tier: true } } },
    });

    if (
      !hasTierAccess({
        tier: user?.premium?.tier ?? null,
        minimumTier: "BUSINESS_PLUS_MONTHLY",
      })
    ) {
      throw new SafeError(
        "Integrations require a Professional plan. Please upgrade to continue.",
      );
    }

    const integrationConfig = getIntegration(integration);

    if (!integrationConfig) {
      throw new SafeError(`Integration ${integration} not found`);
    }

    if (integrationConfig.authType !== "oauth") {
      throw new SafeError(`Integration ${integration} does not support OAuth`);
    }

    try {
      const redirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/mcp/${integration}/callback`;

      const state = generateOAuthState({
        userId,
        emailAccountId,
        type: getMcpOAuthStateType(integration),
      });

      const { url, codeVerifier } = await generateOAuthUrl({
        integration,
        redirectUri,
        state,
      });

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
