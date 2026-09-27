import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ResolvedMcpIntegration } from "@/utils/mcp/resolve-integration";
import { createMcpTransport } from "@/utils/mcp/transport";
import { getMcpServerConnection } from "@/utils/mcp/server-connection";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-list-tools");

export async function listMcpTools(
  integration: ResolvedMcpIntegration,
  emailAccountId: string,
): Promise<
  Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    readOnlyHint?: boolean;
  }>
> {
  const transport = createMcpTransport(
    await getMcpServerConnection(integration, emailAccountId),
  );

  const client = new Client({
    name: `inbox-zero-${integration.name}`,
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();

    logger.info("Listed MCP tools", {
      integration: integration.name,
      toolCount: result.tools.length,
    });

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      readOnlyHint: tool.annotations?.readOnlyHint,
    }));
  } catch (error) {
    logger.error("Failed to list MCP tools", {
      error,
      integration: integration.name,
    });
    throw new Error(
      `Failed to list tools: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    await client.close();
    await transport.close();
  }
}
