import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { getAuthToken } from "@/utils/mcp/oauth";
import { getIntegrationProvider } from "@/utils/mcp/providers/registry";
import type { ResolvedMcpIntegration } from "@/utils/mcp/resolve-integration";
import { getMcpFetch } from "@/utils/mcp/safe-fetch";
import { getMcpServerUrl } from "@/utils/mcp/server-url";

export type McpServerConnection = {
  url: string;
  headers: Record<string, string>;
  fetch?: FetchLike;
};

export async function getMcpServerConnection(
  integration: ResolvedMcpIntegration,
  emailAccountId: string,
): Promise<McpServerConnection> {
  if (integration.provider) {
    return getIntegrationProvider(integration.provider.id).getMcpServer({
      app: integration.provider.app,
      emailAccountId,
      allowedTools: integration.allowedTools ?? [],
    });
  }

  // registeredServerUrl is the OAuth discovery base URL, not the MCP endpoint
  const url = getMcpServerUrl(integration);
  if (!url) {
    throw new Error(`No server URL for integration: ${integration.name}`);
  }

  const authToken = await getAuthToken({ integration, emailAccountId });

  return {
    url,
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    fetch: getMcpFetch(integration),
  };
}
