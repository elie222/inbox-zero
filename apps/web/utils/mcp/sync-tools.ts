import { createMcpClient } from "@/utils/mcp/client";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";
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
  integration: string,
  emailAccountId: string,
) {
  if (!MCP_INTEGRATIONS[integration]) {
    throw new Error(`Unknown integration: ${integration}`);
  }

  const logger = createScopedLogger("mcp-tools-sync").with({
    integration,
    emailAccountId,
  });

  const integrationConfig = MCP_INTEGRATIONS[integration];

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

    const client = createMcpClient(integration, emailAccountId);
    await client.connect();
    const allTools = await client.listTools();
    await client.disconnect();

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

    await prisma.$transaction([
      prisma.mcpIntegration.update({
        where: { id: mcpConnection.integrationId },
        data: {
          displayName: integrationConfig.displayName,
          serverUrl: integrationConfig.serverUrl || "",
          authType: integrationConfig.authType,
          defaultScopes: integrationConfig.scopes,
        },
      }),
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
      prisma.mcpConnection.update({
        where: { id: mcpConnection.id },
        data: { updatedAt: new Date() },
      }),
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
