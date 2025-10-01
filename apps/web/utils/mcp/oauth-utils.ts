import type { IntegrationKey } from "@/utils/mcp/integrations";

export function getMcpOAuthCookieNames(integration: IntegrationKey) {
  return {
    state: `${integration}_mcp_oauth_state`,
    pkce: `${integration}_mcp_pkce_verifier`,
  };
}
