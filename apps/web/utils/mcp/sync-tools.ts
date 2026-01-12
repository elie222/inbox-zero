import { listMcpTools } from "@/utils/mcp/list-tools";
import { getIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

export async function syncMcpTools(
  integration: IntegrationKey,
  emailAccountId: string,
  log: Logger,
) {
  const integrationConfig = getIntegration(integration);
  if (!integrationConfig) {
    throw new Error(`Unknown integration: ${integration}`);
  }

  const logger = log.with({ integration, emailAccountId });

  logger.info("Syncing MCP tools");

  try {
    const mcpConnection = await prisma.mcpConnection.findFirst({
      where: {
        emailAccountId,
        integration: {
          name: integration,
        },
        isActive: true,
      },
      include: {
        integration: true,
      },
    });

    if (!mcpConnection) {
      throw new Error(`No active connection found for ${integration}`);
    }

    const allTools = await listMcpTools(integration, emailAccountId);

    // Filter to only allowed tools if specified in config
    const allowedToolNames = integrationConfig.allowedTools;
    let tools = allowedToolNames
      ? allTools.filter((tool) => allowedToolNames.includes(tool.name))
      : allTools;

    // Filter out write tools if enabled (keeps only get, list, find, search, etc.)
    if (integrationConfig.filterWriteTools) {
      const beforeCount = tools.length;
      tools = tools.filter((tool) => isReadOnlyTool(tool.name));
      logger.info("Filtered write tools", {
        before: beforeCount,
        after: tools.length,
        filtered: beforeCount - tools.length,
      });
    }

    logger.info("Fetched and filtered tools from MCP server", {
      totalToolsAvailable: allTools.length,
      allowedToolsCount: tools.length,
      allowedTools: allowedToolNames,
    });

    // Delete existing tools and create new ones
    await prisma.$transaction([
      prisma.mcpTool.deleteMany({
        where: { connectionId: mcpConnection.id },
      }),
      ...(tools.length > 0
        ? [
            prisma.mcpTool.createMany({
              data: tools.map((tool) => ({
                connectionId: mcpConnection.id,
                name: tool.name,
                description: tool.description,
                schema: tool.inputSchema as Prisma.InputJsonValue,
                isEnabled: !integrationConfig.defaultToolsDisabled,
              })),
            }),
          ]
        : []),
    ]);

    logger.info("Successfully synced MCP tools", {
      connectionId: mcpConnection.id,
      toolsStored: tools.length,
    });

    return {
      success: true,
      toolsCount: tools.length,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    };
  } catch (error) {
    logger.error("Failed to sync MCP tools", { error });

    throw new Error(
      `Failed to sync tools: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Read-only action verbs - check if the second segment matches
const READ_ONLY_ACTIONS = [
  "get",
  "retrieve",
  "find",
  "search",
  "list",
  "fetch",
  "read",
  "query",
  "describe",
  "lookup",
  "view",
  "show",
];

/**
 * Checks if a tool name indicates a read-only operation.
 * Tool names follow pattern: "app-action-target" (e.g., "slack_v2-list-channels")
 */
export function isReadOnlyTool(toolName: string): boolean {
  const parts = toolName.toLowerCase().split("-");
  if (parts.length < 2) return false;

  const action = parts[1];
  return READ_ONLY_ACTIONS.includes(action);
}
