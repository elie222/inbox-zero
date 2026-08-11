import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getAuthToken } from "@/utils/mcp/oauth";
import { getIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import { getIntegrationRemoteSelectTools } from "@/utils/mcp/tool-specs";
import { createMcpTransport } from "@/utils/mcp/transport";
import { getMcpServerUrl } from "@/utils/mcp/server-url";
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

  const serverUrl = getMcpServerUrl(integrationConfig);
  if (!serverUrl) {
    throw new Error(`No server URL for integration: ${integration}`);
  }

  // Write tools come from the registry; the read tools the app calls itself are
  // derived from the specs that declare them, so the two cannot drift apart.
  const callableTools = [
    ...(integrationConfig.ruleActionWriteTools ?? []),
    ...getIntegrationRemoteSelectTools(integration),
  ];
  if (!callableTools.includes(toolName)) {
    throw new Error(`Tool ${toolName} is not callable for ${integration}`);
  }

  const authToken = await getAuthToken({ integration, emailAccountId });

  const transport = createMcpTransport(serverUrl, authToken);

  const client = new Client({
    name: `inbox-zero-${integration}`,
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });

    if (result.isError) {
      throw new Error(
        `Tool ${toolName} returned an error: ${stringifyToolContent(result.content)}`,
      );
    }

    logger.info("Called MCP tool", { integration, toolName });

    return result.content;
  } catch (error) {
    logger.error("Failed to call MCP tool", { error, integration, toolName });
    throw new Error(
      `Failed to call ${integration} tool ${toolName}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    await client.close();
    await transport.close();
  }
}

function stringifyToolContent(content: unknown): string {
  if (!Array.isArray(content)) return JSON.stringify(content);

  return content
    .map((item) =>
      item && typeof item === "object" && "text" in item
        ? String(item.text)
        : JSON.stringify(item),
    )
    .join("\n");
}
