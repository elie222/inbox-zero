import { experimental_createMCPClient } from "ai";
import { getIntegration } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getAuthToken } from "@/utils/mcp/oauth";
import { createMcpTransport } from "@/utils/mcp/transport";

type MCPClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

export type MCPToolsResult = {
  tools: Record<string, unknown>;
  cleanup: () => Promise<void>;
};

export async function createMcpToolsForAgent(
  emailAccountId: string,
): Promise<MCPToolsResult> {
  const logger = createScopedLogger("ai-mcp-tools").with({ emailAccountId });

  try {
    const connections = await prisma.mcpConnection.findMany({
      where: {
        emailAccountId,
        isActive: true,
        tools: {
          some: {
            isEnabled: true,
          },
        },
      },
      select: {
        id: true,
        integration: {
          select: {
            id: true,
            name: true,
            registeredServerUrl: true,
          },
        },
        tools: {
          where: { isEnabled: true },
          select: {
            name: true,
          },
        },
      },
    });

    if (connections.length === 0) {
      return {
        tools: {},
        cleanup: async () => {},
      };
    }

    const clients: MCPClient[] = [];

    const toolsByIntegration: Map<
      string,
      { integrationName: string; tools: Record<string, unknown> }
    > = new Map();

    for (const connection of connections) {
      const integration = connection.integration;
      const integrationConfig = getIntegration(integration.name);

      if (!integrationConfig) {
        logger.warn("Integration config not found", {
          integration: integration.name,
        });
        continue;
      }

      // Use registered server URL if available, otherwise fall back to config
      const serverUrl =
        integration.registeredServerUrl ?? integrationConfig.serverUrl;
      if (!serverUrl) {
        logger.warn("No server URL available", {
          integration: integration.name,
        });
        continue;
      }

      try {
        const authToken = await getAuthToken({
          integration: integration.name,
          emailAccountId,
        });

        const transport = createMcpTransport(serverUrl, authToken);

        const mcpClient = await experimental_createMCPClient({ transport });
        clients.push(mcpClient);

        const mcpTools = await mcpClient.tools();

        // Filter to only enabled tools
        const enabledToolNames = connection.tools.map((tool) => tool.name);
        const filteredTools = Object.fromEntries(
          Object.entries(mcpTools).filter(([toolName]) =>
            enabledToolNames.includes(toolName),
          ),
        );

        toolsByIntegration.set(integration.id, {
          integrationName: integration.name,
          tools: filteredTools,
        });
      } catch (error) {
        logger.error("Failed to create MCP client for integration", {
          error: error instanceof Error ? error.message : String(error),
          integration: integration.name,
        });
        // Continue with other integrations
      }
    }

    const allTools = mergeToolsWithConflictResolution(toolsByIntegration);

    return {
      tools: allTools,
      cleanup: async () => {
        await Promise.all(
          clients.map(async (client) => {
            try {
              await client.close();
            } catch (error) {
              logger.warn("Error closing MCP client", { error });
            }
          }),
        );
      },
    };
  } catch (error) {
    logger.error("Failed to create MCP tools for agent", { error });
    return {
      tools: {},
      cleanup: async () => {},
    };
  }
}

/**
 * Merges tools from multiple integrations, adding integration prefix only when there are naming conflicts.
 *
 * @param toolsByIntegration - Map of integration tools grouped by integration
 * @returns Merged tools with prefixes added only for conflicting names
 */
function mergeToolsWithConflictResolution(
  toolsByIntegration: Map<
    string,
    { integrationName: string; tools: Record<string, unknown> }
  >,
): Record<string, unknown> {
  const allTools: Record<string, unknown> = {};
  const toolNameToIntegrations = new Map<string, string[]>();

  // Build a map of tool names to their integrations
  for (const [_, { integrationName, tools }] of toolsByIntegration) {
    for (const toolName of Object.keys(tools)) {
      if (!toolNameToIntegrations.has(toolName)) {
        toolNameToIntegrations.set(toolName, []);
      }
      toolNameToIntegrations.get(toolName)!.push(integrationName);
    }
  }

  // Merge tools, prefixing only when there's a conflict
  for (const [__, { integrationName, tools }] of toolsByIntegration) {
    for (const [toolName, toolDef] of Object.entries(tools)) {
      const integrationsWithThisTool = toolNameToIntegrations.get(toolName)!;

      // Only prefix if this tool name appears in multiple integrations
      const finalToolName =
        integrationsWithThisTool.length > 1
          ? `${integrationName}-${toolName}`
          : toolName;

      allTools[finalToolName] = toolDef;
    }
  }

  return allTools;
}
