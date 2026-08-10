import { listMcpTools } from "@/utils/mcp/list-tools";
import { findIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

export async function syncMcpTools(
  integration: IntegrationKey,
  emailAccountId: string,
  log: Logger,
) {
  const integrationConfig = findIntegration(integration);
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
        tools: { select: { name: true, isEnabled: true } },
      },
    });

    if (!mcpConnection) {
      throw new Error(`No active connection found for ${integration}`);
    }

    const allTools = await listMcpTools(integration, emailAccountId);

    const writeToolNames = integrationConfig.writeTools ?? [];
    const writeTools = allTools.filter((tool) =>
      writeToolNames.includes(tool.name),
    );

    // Filter to only allowed tools if specified in config
    const allowedToolNames = integrationConfig.allowedTools;
    let readTools = allowedToolNames
      ? allTools.filter((tool) => allowedToolNames.includes(tool.name))
      : allTools;
    readTools = readTools.filter((tool) => !writeToolNames.includes(tool.name));

    // Filter out write tools if enabled (keeps only get, list, find, search, etc.)
    if (integrationConfig.filterWriteTools) {
      const beforeCount = readTools.length;
      readTools = readTools.filter(
        (tool) => tool.readOnlyHint ?? isReadOnlyTool(tool.name),
      );
      logger.info("Filtered write tools", {
        before: beforeCount,
        after: readTools.length,
        filtered: beforeCount - readTools.length,
      });
    }

    const tools = [
      ...readTools.map((tool) => ({ ...tool, isWrite: false })),
      ...writeTools.map((tool) => ({ ...tool, isWrite: true })),
    ];

    logger.info("Fetched and filtered tools from MCP server", {
      totalToolsAvailable: allTools.length,
      allowedToolsCount: readTools.length,
      writeToolsCount: writeTools.length,
      allowedTools: allowedToolNames,
    });

    // Replace stored tools, preserving the user's enable/disable choices for
    // tools that already existed
    const existingEnabledByName = new Map(
      mcpConnection.tools.map((tool) => [tool.name, tool.isEnabled]),
    );

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
                isEnabled: existingEnabledByName.get(tool.name) ?? true,
                isWrite: tool.isWrite,
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
