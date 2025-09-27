"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { createMcpClient } from "@/utils/mcp/client";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-tools-sync");

const syncToolsSchema = z.object({
  integration: z.string().min(1),
});

export const syncMcpToolsAction = actionClient
  .metadata({ name: "syncMcpTools" })
  .schema(syncToolsSchema)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { integration } }) => {
    // Validate integration
    if (!MCP_INTEGRATIONS[integration as IntegrationKey]) {
      throw new Error(`Unknown integration: ${integration}`);
    }

    const integrationConfig = MCP_INTEGRATIONS[integration as IntegrationKey];
    if (integrationConfig.authType !== "oauth") {
      throw new Error(`Integration ${integration} does not support OAuth`);
    }

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

      // Connect to MCP server and fetch tools
      const client = createMcpClient(
        integration as IntegrationKey,
        emailAccountId,
      );
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
            description: integrationConfig.description || "",
            serverUrl: integrationConfig.serverUrl || "",
            authType: integrationConfig.authType,
            defaultScopes: integrationConfig.defaultScopes,
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
              schema: tool.inputSchema as any, // Store the JSON schema
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
  });
