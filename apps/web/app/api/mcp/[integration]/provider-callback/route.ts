import { NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import {
  getMcpOAuthStateType,
  getMcpStateCookieName,
  parseSignedOAuthState,
} from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";
import { findIntegration } from "@/utils/mcp/integrations";
import { getIntegrationProvider } from "@/utils/mcp/providers/registry";
import { syncMcpTools } from "@/utils/mcp/sync-tools";

// The provider ran the app's OAuth and holds the tokens. We only record that the
// connection exists and sync its tools. The provider does not echo our state, so
// the signed state cookie set when the connection started identifies the account.
export const GET = withError(
  "mcp/provider-callback",
  async (request, { params }) => {
    const { integration } = await params;
    const logger = request.logger.with({ integration });

    const stateCookieName = getMcpStateCookieName(integration);
    const redirect = (url: URL) => {
      const response = NextResponse.redirect(url);
      response.cookies.delete(stateCookieName);
      return response;
    };

    const fallbackUrl = new URL("/integrations", env.NEXT_PUBLIC_BASE_URL);

    const state = readState(request.cookies.get(stateCookieName)?.value);
    if (!state || state.type !== getMcpOAuthStateType(integration)) {
      logger.warn("Invalid state during provider callback");
      fallbackUrl.searchParams.set("error", "invalid_state");
      return redirect(fallbackUrl);
    }

    const { userId, emailAccountId } = state;
    const redirectUrl = new URL(
      prefixPath(emailAccountId, "/integrations"),
      env.NEXT_PUBLIC_BASE_URL,
    );

    const emailAccount = await prisma.emailAccount.findFirst({
      where: { id: emailAccountId, userId },
      select: { id: true },
    });
    const integrationConfig = findIntegration(integration);
    if (!emailAccount || !integrationConfig?.provider) {
      logger.warn("Rejected provider callback", {
        hasEmailAccount: !!emailAccount,
      });
      redirectUrl.searchParams.set("error", "forbidden");
      return redirect(redirectUrl);
    }

    const provider = getIntegrationProvider(integrationConfig.provider.id);
    const connected = await provider
      .completeConnection({
        app: integrationConfig.provider.app,
        emailAccountId,
      })
      .catch((error) => {
        logger.error("Failed to confirm provider connection", { error });
        return false;
      });

    if (!connected) {
      redirectUrl.searchParams.set("error", "connection_failed");
      return redirect(redirectUrl);
    }

    const dbIntegration = await prisma.mcpIntegration.upsert({
      where: { name: integration },
      update: {},
      create: { name: integration },
      select: { id: true },
    });

    await prisma.mcpConnection.upsert({
      where: {
        emailAccountId_integrationId: {
          emailAccountId,
          integrationId: dbIntegration.id,
        },
      },
      update: { isActive: true },
      create: {
        name: integration,
        emailAccountId,
        integrationId: dbIntegration.id,
        isActive: true,
      },
    });

    logger.info("Connected provider integration", { emailAccountId });

    try {
      await syncMcpTools(integration, emailAccountId, logger);
    } catch (error) {
      logger.error("Failed to sync tools after provider connection", {
        error,
      });
      redirectUrl.searchParams.set("error", "tool_sync_failed");
      return redirect(redirectUrl);
    }

    redirectUrl.searchParams.set("connected", integration);
    return redirect(redirectUrl);
  },
);

function readState(cookie: string | undefined) {
  if (!cookie) return null;
  try {
    const state = parseSignedOAuthState<{
      userId: unknown;
      emailAccountId: unknown;
      type: unknown;
    }>(cookie);
    if (
      typeof state.userId !== "string" ||
      typeof state.emailAccountId !== "string" ||
      typeof state.type !== "string"
    ) {
      return null;
    }
    return {
      userId: state.userId,
      emailAccountId: state.emailAccountId,
      type: state.type,
    };
  } catch {
    return null;
  }
}
