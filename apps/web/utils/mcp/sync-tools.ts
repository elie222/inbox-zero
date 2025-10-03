import { listMcpTools } from "@/utils/mcp/list-tools";
import { getIntegration, type IntegrationKey } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { Prisma } from "@prisma/client";

/**
 * Syncs tools from an MCP integration server to the database
 * @param integration The integration name
 * @param emailAccountId The email account ID
 * @returns The number of tools synced and their details
 */
export async function syncMcpTools(
  integration: IntegrationKey,
  emailAccountId: string,
) {
  const integrationConfig = getIntegration(integration);
  if (!integrationConfig) {
    throw new Error(`Unknown integration: ${integration}`);
  }

  const logger = createScopedLogger("mcp-tools-sync").with({
    integration,
    emailAccountId,
  });

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
    const tools = allowedToolNames
      ? allTools.filter((tool) => allowedToolNames.includes(tool.name))
      : allTools;

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
                isEnabled: true,
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
