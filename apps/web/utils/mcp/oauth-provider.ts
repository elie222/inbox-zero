import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError } from "better-auth";
import { jwt } from "better-auth/plugins";
import prisma from "@/utils/prisma";
import {
  MCP_SCOPES,
  getMcpResourceUrl,
  isMcpServerAvailable,
} from "@/utils/mcp/config";

export function mcpOAuthPlugins() {
  if (!isMcpServerAvailable()) return [];

  return [
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/mcp/login",
      consentPage: "/mcp/consent",
      scopes: [...MCP_SCOPES],
      resources: [getMcpResourceUrl()],
      clientRegistrationDefaultResources: [getMcpResourceUrl()],
      clientRegistrationAllowedResources: [getMcpResourceUrl()],
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultScopes: ["mcp:read", "offline_access"],
      clientRegistrationAllowedScopes: [...MCP_SCOPES],
      customAccessTokenClaims: async ({ user, resources }) => {
        if (
          !user ||
          resources?.length !== 1 ||
          resources[0] !== getMcpResourceUrl()
        ) {
          throw new APIError("BAD_REQUEST", { error: "invalid_target" });
        }
        const access = await prisma.user.findUnique({
          where: { id: user.id },
          select: { mcpServerEnabled: true, mcpTokenVersion: true },
        });
        if (!access?.mcpServerEnabled) {
          throw new APIError("FORBIDDEN", { error: "access_denied" });
        }
        return { mcp_token_version: access.mcpTokenVersion };
      },
    }),
  ];
}
