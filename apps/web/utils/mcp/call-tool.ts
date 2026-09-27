import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import { getIntegrationRemoteSelectTools } from "@/utils/mcp/tool-specs";
import { createMcpTransport } from "@/utils/mcp/transport";
import { getMcpServerConnection } from "@/utils/mcp/server-connection";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-call-tool");

export async function callMcpTool({
  emailAccountId,
  integration,
  toolName,
  args,
}: {
  emailAccountId: string;
  integration: IntegrationKey;
  toolName: string;
  args: Record<string, unknown>;
}) {
  const integrationConfig = getIntegration(integration);

  // Write tools come from the registry; the read tools the app calls itself are
  // derived from the specs that declare them, so the two cannot drift apart.
  const callableTools = [
    ...(integrationConfig.ruleActionWriteTools ?? []),
    ...getIntegrationRemoteSelectTools(integration),
  ];
  if (!callableTools.includes(toolName)) {
    throw new Error(`Tool ${toolName} is not callable for ${integration}`);
  }

  const transport = createMcpTransport(
    await getMcpServerConnection(
      { ...integrationConfig, isCustom: false },
      emailAccountId,
    ),
  );

  const client = new Client({
    name: `inbox-zero-${integration}`,
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });

    if (result.isError) {
      throw new Error("MCP tool returned an error");
    }

    logger.info("Called MCP tool", { integration, toolName });

    return result.content;
  } catch (error) {
    logger.error("Failed to call MCP tool", {
      integration,
      toolName,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    logger.trace("MCP tool call failure details", () => ({ error }));
    throw new Error(`Failed to call ${integration} tool ${toolName}`);
  } finally {
    await client.close();
    await transport.close();
  }
}
