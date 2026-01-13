import { experimental_createMCPClient } from "@ai-sdk/mcp";
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

/**
 * Create MCP tools for the agent by fetching tools from user's configured MCP integrations.
 * (e.g., Notion, Stripe, Monday)
 *
 * Tools are prefixed to avoid naming collisions only when there are conflicts between integrations.
 *
 * Note: Plugin-exposed MCP tools are handled separately via the plugin runtime's getMcpTools.
 *
 * @param emailAccountId - Email account ID for fetching user's MCP integrations
 * @returns MCP tools and cleanup function
 */
export async function createMcpToolsForAgent(
  emailAccountId: string,
): Promise<MCPToolsResult> {
  const logger = createScopedLogger("ai-mcp-tools").with({ emailAccountId });

  const clients: MCPClient[] = [];

  try {
    const integrationToolsResult = await fetchIntegrationMcpTools(
      emailAccountId,
      clients,
      logger,
    );

    const allTools = mergeToolsWithConflictResolution(integrationToolsResult);

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
    // cleanup any clients that were created before the error
    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.close();
        } catch {
          // ignore cleanup errors
        }
      }),
    );
    return {
      tools: {},
      cleanup: async () => {},
    };
  }
}

/**
 * Fetch MCP tools from user's configured integrations.
 */
async function fetchIntegrationMcpTools(
  emailAccountId: string,
  clients: MCPClient[],
  logger: ReturnType<typeof createScopedLogger>,
): Promise<
  Map<string, { integrationName: string; tools: Record<string, unknown> }>
> {
  const toolsByIntegration = new Map<
    string,
    { integrationName: string; tools: Record<string, unknown> }
  >();

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
    return toolsByIntegration;
  }

  for (const connection of connections) {
    const integration = connection.integration;
    const integrationConfig = getIntegration(integration.name);

    if (!integrationConfig) {
      logger.warn("Integration config not found", {
        integration: integration.name,
      });
      continue;
    }

    // use registered server URL if available, otherwise fall back to config
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

      // filter to only enabled tools
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
        error,
        integration: integration.name,
      });
      // continue with other integrations
    }
  }

  return toolsByIntegration;
}

/**
 * Merges tools from multiple integrations, adding integration prefix only when there are naming conflicts.
 *
 * @param toolsByIntegration - Map of integration tools grouped by integration
 * @returns Merged tools with prefixes added only for conflicting names
 */
export function mergeToolsWithConflictResolution(
  toolsByIntegration: Map<
    string,
    { integrationName: string; tools: Record<string, unknown> }
  >,
): Record<string, unknown> {
  const allTools: Record<string, unknown> = {};
  const toolNameToIntegrations = new Map<string, string[]>();

  // build a map of tool names to their integrations
  for (const [, { integrationName, tools }] of toolsByIntegration) {
    for (const toolName of Object.keys(tools)) {
      if (!toolNameToIntegrations.has(toolName)) {
        toolNameToIntegrations.set(toolName, []);
      }
      toolNameToIntegrations.get(toolName)!.push(integrationName);
    }
  }

  // merge tools, prefixing only when there's a conflict
  for (const [, { integrationName, tools }] of toolsByIntegration) {
    for (const [toolName, toolDef] of Object.entries(tools)) {
      const integrationsWithThisTool = toolNameToIntegrations.get(toolName)!;

      // only prefix if this tool name appears in multiple integrations
      const finalToolName =
        integrationsWithThisTool.length > 1
          ? `${integrationName}-${toolName}`
          : toolName;

      allTools[finalToolName] = toolDef;
    }
  }

  return allTools;
}
