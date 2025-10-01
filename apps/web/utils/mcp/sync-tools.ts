import { createMcpClient } from "@/utils/mcp/client";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-tools-sync");

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
  // Validate integration
  if (!MCP_INTEGRATIONS[integration]) {
    throw new Error(`Unknown integration: ${integration}`);
  }

  const integrationConfig = MCP_INTEGRATIONS[integration];

  logger.info("Syncing MCP tools", { integration, emailAccountId });

  try {
    // Get the MCP connection
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
      integration,
      emailAccountId,
      totalToolsAvailable: allTools.length,
      allowedToolsCount: tools.length,
      allowedTools: allowedToolNames,
    });

    // Store tools in database
    const transactionOperations = [
      // Update integration config to latest values
      prisma.mcpIntegration.update({
        where: { id: mcpConnection.integrationId },
        data: {
          displayName: integrationConfig.displayName,
          serverUrl: integrationConfig.serverUrl || "",
          authType: integrationConfig.authType,
          defaultScopes: integrationConfig.scopes,
        },
      }),

      // Delete existing tools for this connection
      prisma.mcpTool.deleteMany({
        where: { connectionId: mcpConnection.id },
      }),

      // Update the connection to mark tools as synced
      prisma.mcpConnection.update({
        where: { id: mcpConnection.id },
        data: { updatedAt: new Date() },
      }),
    ];

    // Insert new tools if any exist
    if (tools.length > 0) {
      transactionOperations.splice(
        2,
        0, // Insert at index 2, before the connection update
        prisma.mcpTool.createMany({
          data: tools.map((tool) => ({
            connectionId: mcpConnection.id,
            name: tool.name,
            title: tool.name, // Use name as title if not provided
            description: tool.description,
            schema: tool.inputSchema, // Store the JSON schema
            isEnabled: true, // Enable all tools by default
          })),
        }),
      );
    }

    await prisma.$transaction(transactionOperations);

    logger.info("Successfully synced MCP tools", {
      integration,
      emailAccountId,
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
    logger.error("Failed to sync MCP tools", {
      error,
      integration,
      emailAccountId,
    });

    throw new Error(
      `Failed to sync tools: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
