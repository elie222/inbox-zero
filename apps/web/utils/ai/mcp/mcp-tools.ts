import { experimental_createMCPClient } from "@ai-sdk/mcp";
import { tool } from "ai";
import { getIntegration } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getAuthToken } from "@/utils/mcp/oauth";
import { createMcpTransport } from "@/utils/mcp/transport";
import { pluginRuntime } from "@/lib/plugin-runtime/runtime";
import type { PluginMcpTool } from "@/packages/plugin-sdk/src/types/mcp";
import type { z } from "zod";

type MCPClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

export type MCPToolsResult = {
  tools: Record<string, unknown>;
  cleanup: () => Promise<void>;
};

export type CreateMcpToolsOptions = {
  emailAccountId: string;
  userId?: string;
};

/**
 * Create MCP tools for the agent by fetching tools from:
 * 1. User's configured MCP integrations (e.g., Notion, Stripe, Monday)
 * 2. Plugin-exposed MCP tools (when userId is provided)
 *
 * Tools are prefixed to avoid naming collisions only when there are conflicts.
 *
 * @param options - Email account ID and optional user ID for plugin tools
 * @returns MCP tools and cleanup function
 */
export async function createMcpToolsForAgent(
  options: CreateMcpToolsOptions | string,
): Promise<MCPToolsResult> {
  // support both old string signature and new object signature
  const { emailAccountId, userId } =
    typeof options === "string"
      ? { emailAccountId: options, userId: undefined }
      : options;

  const logger = createScopedLogger("ai-mcp-tools").with({
    emailAccountId,
    userId,
  });

  const clients: MCPClient[] = [];

  try {
    // fetch integration MCP tools
    const integrationToolsResult = await fetchIntegrationMcpTools(
      emailAccountId,
      clients,
      logger,
    );

    // fetch plugin MCP tools if userId provided
    let pluginTools: Record<string, unknown> = {};
    if (userId) {
      pluginTools = await fetchPluginMcpTools(userId, emailAccountId, logger);
    }

    // merge all tools
    const integrationTools = mergeToolsWithConflictResolution(
      integrationToolsResult,
    );
    const allTools = { ...integrationTools, ...pluginTools };

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
 * Fetch MCP tools exposed by plugins.
 * Converts plugin tool format to AI SDK tool format.
 */
async function fetchPluginMcpTools(
  userId: string,
  emailAccountId: string,
  logger: ReturnType<typeof createScopedLogger>,
): Promise<Record<string, unknown>> {
  try {
    const pluginToolsMap = await pluginRuntime.getMcpTools(
      userId,
      emailAccountId,
    );

    if (pluginToolsMap.size === 0) {
      return {};
    }

    const tools: Record<string, unknown> = {};

    for (const [toolName, { pluginId, tool: pluginTool }] of pluginToolsMap) {
      tools[toolName] = convertPluginToolToAiSdkTool(
        pluginTool,
        pluginId,
        userId,
        emailAccountId,
        logger,
      );
    }

    logger.trace("Loaded plugin MCP tools", {
      count: Object.keys(tools).length,
      tools: Object.keys(tools),
    });

    return tools;
  } catch (error) {
    logger.error("Failed to fetch plugin MCP tools", { error });
    return {};
  }
}

/**
 * Convert a plugin MCP tool to AI SDK tool format.
 *
 * Note: Plugin MCP tools receive a minimal context since full ChatToolContext
 * (with storage, llm) would require async initialization. Plugins needing
 * storage/llm should use chatTools instead of mcpTools.
 */
function convertPluginToolToAiSdkTool(
  pluginTool: PluginMcpTool,
  pluginId: string,
  _userId: string,
  emailAccountId: string,
  logger: ReturnType<typeof createScopedLogger>,
) {
  // use AI SDK tool helper with inputSchema (AI SDK uses inputSchema, not parameters)
  return tool({
    description: pluginTool.description,
    inputSchema: pluginTool.parameters as z.ZodSchema,
    execute: async (params: Record<string, unknown>) => {
      logger.trace("Executing plugin MCP tool", { pluginId });

      // MCP tools receive minimal context - use chatTools for full context
      const ctx = {
        emailAccount: {
          id: emailAccountId,
          email: "", // not available in this context
          provider: "google" as const,
        },
        // storage and llm not available for MCP tools
        // plugins needing these should use chatTools instead
        storage: null as never,
        llm: null as never,
      };

      try {
        const result = await pluginTool.execute(params, ctx);
        return result;
      } catch (error) {
        logger.error("Plugin MCP tool execution failed", {
          pluginId,
          error,
        });
        throw error;
      }
    },
  });
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
