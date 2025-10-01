/**
 * Simple utility to list MCP tools from an integration
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getValidAccessToken } from "@/utils/mcp/oauth";
import { getIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import { createMcpTransport } from "@/utils/mcp/transport";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-list-tools");

/**
 * Lists available tools from an MCP integration server
 * @param integration The integration name
 * @param emailAccountId The email account ID
 * @returns Array of available tools with their schemas
 */
export async function listMcpTools(
  integration: IntegrationKey,
  emailAccountId: string,
): Promise<
  Array<{ name: string; description?: string; inputSchema?: unknown }>
> {
  const integrationConfig = getIntegration(integration);

  if (!integrationConfig.serverUrl) {
    throw new Error(`No server URL for integration: ${integration}`);
  }

  const accessToken = await getValidAccessToken({
    integration,
    emailAccountId,
  });

  const transport = createMcpTransport(
    integrationConfig.serverUrl,
    accessToken,
  );

  const client = new Client({
    name: `inbox-zero-${integration}`,
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();

    logger.info("Listed MCP tools", {
      integration,
      toolCount: result.tools.length,
    });

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  } catch (error) {
    logger.error("Failed to list MCP tools", { error, integration });
    throw new Error(
      `Failed to list tools: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    await client.close();
    await transport.close();
  }
}
