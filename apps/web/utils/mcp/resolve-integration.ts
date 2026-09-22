import prisma from "@/utils/prisma";
import { findIntegration } from "@/utils/mcp/integrations";

export const CUSTOM_INTEGRATION_PREFIX = "custom_";

export type ResolvedMcpIntegration = {
  name: string;
  displayName: string;
  serverUrl?: string;
  authType: "oauth" | "api-token";
  scopes: string[];
  skipResourceParam?: boolean;
  filterWriteTools?: boolean;
  allowedTools?: string[];
  ruleActionWriteTools?: string[];
  oauthConfig?: {
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
  };
  isCustom: boolean;
};

export async function resolveMcpIntegration({
  name,
  emailAccountId,
}: {
  name: string;
  emailAccountId: string;
}): Promise<ResolvedMcpIntegration | undefined> {
  if (!name.startsWith(CUSTOM_INTEGRATION_PREFIX)) {
    const builtIn = findIntegration(name);
    if (!builtIn) return;
    return { ...builtIn, isCustom: false };
  }

  // A custom server is only resolvable by the email account that registered it
  const custom = await prisma.mcpIntegration.findFirst({
    where: { name, emailAccountId },
    select: {
      name: true,
      displayName: true,
      serverUrl: true,
      authType: true,
    },
  });

  if (!custom?.serverUrl || !custom.authType) return;

  return {
    name: custom.name,
    displayName: custom.displayName || custom.name,
    serverUrl: custom.serverUrl,
    authType: custom.authType === "API_TOKEN" ? "api-token" : "oauth",
    scopes: [],
    isCustom: true,
  };
}
