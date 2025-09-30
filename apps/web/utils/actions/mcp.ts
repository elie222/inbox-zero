"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  connectMcpApiTokenBody,
  disconnectMcpConnectionBody,
  toggleMcpConnectionBody,
  toggleMcpToolBody,
} from "@/utils/actions/mcp.validation";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";
import { SafeError } from "@/utils/error";
import type { McpConnection } from "@prisma/client";
import { syncMcpTools } from "@/utils/mcp/sync-tools";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import { getEmailAccountWithAi } from "@/utils/user/get";
import type { EmailForLLM } from "@/utils/types";
import { testMcpSchema } from "@/utils/actions/mcp.validation";

const logger = createScopedLogger("mcp-connect");

export const connectMcpApiTokenAction = actionClient
  .metadata({ name: "connectMcpApiToken" })
  .schema(connectMcpApiTokenBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { integration, name, apiKey },
    }) => {
      const logger_with_context = logger.with({ userId, emailAccountId });

      logger_with_context.info("Processing MCP API token connection", {
        integration,
        connectionName: name,
      });

      // Validate integration exists and supports API tokens
      const integrationConfig = MCP_INTEGRATIONS[integration];
      if (!integrationConfig) {
        throw new Error(`Integration '${integration}' not found`);
      }

      if (integrationConfig.authType !== "api-token") {
        throw new Error(
          `Integration '${integration}' does not support API token authentication`,
        );
      }

      // Find or create the integration in database
      let mcpIntegration = await prisma.mcpIntegration.findUnique({
        where: { name: integration },
      });

      if (!mcpIntegration) {
        mcpIntegration = await prisma.mcpIntegration.create({
          data: {
            name: integrationConfig.name,
            displayName: integrationConfig.displayName,
            serverUrl: integrationConfig.serverUrl,
            npmPackage: integrationConfig.npmPackage,
            authType: integrationConfig.authType,
            defaultScopes: integrationConfig.defaultScopes,
          },
        });
      }

      // Check for existing connection
      const existingConnection = await prisma.mcpConnection.findUnique({
        where: {
          emailAccountId_integrationId: {
            emailAccountId,
            integrationId: mcpIntegration.id,
          },
        },
      });

      let connection: McpConnection;
      if (existingConnection) {
        // Update existing connection
        connection = await prisma.mcpConnection.update({
          where: { id: existingConnection.id },
          data: {
            name,
            apiKey, // This will be encrypted by Prisma extension
            isActive: true,
            approvedScopes: integrationConfig.defaultScopes,
            approvedTools: integrationConfig.allowedTools || [],
          },
        });

        logger_with_context.info("Updated existing MCP connection", {
          connectionId: connection.id,
        });
      } else {
        // Create new connection
        connection = await prisma.mcpConnection.create({
          data: {
            name,
            integrationId: mcpIntegration.id,
            emailAccountId,
            apiKey, // This will be encrypted by Prisma extension
            isActive: true,
            approvedScopes: integrationConfig.defaultScopes,
            approvedTools: integrationConfig.allowedTools || [],
          },
        });

        logger_with_context.info("Created new MCP connection", {
          connectionId: connection.id,
        });
      }

      // Automatically sync tools after successful connection
      try {
        const syncResult = await syncMcpTools(integration, emailAccountId);
        logger_with_context.info(
          "Auto-synced tools after API token connection",
          {
            integration,
            toolsCount: syncResult.toolsCount,
          },
        );
      } catch (error) {
        logger_with_context.error(
          "Failed to auto-sync tools after API token connection",
          {
            error,
            integration,
          },
        );
        // Don't fail the connection if sync fails - user can retry manually
      }

      return {
        connectionId: connection.id,
        message: `Successfully connected to ${integrationConfig.displayName}`,
      };
    },
  );

export const disconnectMcpConnectionAction = actionClient
  .metadata({ name: "disconnectMcpConnection" })
  .schema(disconnectMcpConnectionBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { connectionId },
    }) => {
      const logger_with_context = logger.with({ userId, emailAccountId });

      logger_with_context.info("Disconnecting MCP connection", {
        connectionId,
      });

      // Verify the connection exists and belongs to this email account
      const connection = await prisma.mcpConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
        include: {
          integration: true,
        },
      });

      if (!connection) {
        throw new SafeError("Connection not found");
      }

      // Delete the connection (this will cascade delete associated tools)
      await prisma.mcpConnection.delete({
        where: { id: connectionId },
      });

      logger_with_context.info("Successfully disconnected MCP connection", {
        connectionId,
        integration: connection.integration.name,
      });

      return {
        success: true,
        message: `Successfully disconnected from ${connection.integration.displayName}`,
      };
    },
  );

export const toggleMcpConnectionAction = actionClient
  .metadata({ name: "toggleMcpConnection" })
  .schema(toggleMcpConnectionBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { connectionId, isActive },
    }) => {
      const logger_with_context = logger.with({ userId, emailAccountId });

      logger_with_context.info("Toggling MCP connection", {
        connectionId,
        isActive,
      });

      // Verify the connection exists and belongs to this email account
      const connection = await prisma.mcpConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
        include: {
          integration: true,
        },
      });

      if (!connection) {
        throw new SafeError("Connection not found");
      }

      // Update the connection status
      const updatedConnection = await prisma.mcpConnection.update({
        where: { id: connectionId },
        data: { isActive },
      });

      logger_with_context.info("Successfully toggled MCP connection", {
        connectionId,
        integration: connection.integration.name,
        isActive,
      });

      return {
        success: true,
        isActive: updatedConnection.isActive,
        message: `${connection.integration.displayName} ${isActive ? "enabled" : "disabled"}`,
      };
    },
  );

export const toggleMcpToolAction = actionClient
  .metadata({ name: "toggleMcpTool" })
  .schema(toggleMcpToolBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { toolId, isEnabled },
    }) => {
      const logger_with_context = logger.with({ userId, emailAccountId });

      logger_with_context.info("Toggling MCP tool", {
        toolId,
        isEnabled,
      });

      // Verify the tool exists and belongs to a connection owned by this email account
      const tool = await prisma.mcpTool.findFirst({
        where: {
          id: toolId,
          connection: {
            emailAccountId,
          },
        },
        include: {
          connection: {
            include: {
              integration: true,
            },
          },
        },
      });

      if (!tool) {
        throw new SafeError("Tool not found");
      }

      // Update the tool status
      const updatedTool = await prisma.mcpTool.update({
        where: { id: toolId },
        data: { isEnabled },
      });

      logger_with_context.info("Successfully toggled MCP tool", {
        toolId,
        toolName: tool.name,
        isEnabled,
      });

      return {
        success: true,
        isEnabled: updatedTool.isEnabled,
        message: `${tool.name} ${isEnabled ? "enabled" : "disabled"}`,
      };
    },
  );

export const testMcpAction = actionClient
  .metadata({ name: "mcpAgent" })
  .schema(testMcpSchema)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { from, subject, content },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) throw new SafeError("Email account not found");

      const testMessage: EmailForLLM = {
        id: "test-message-id",
        to: emailAccount.email,
        from,
        subject,
        content,
      };

      const result = await mcpAgent({ emailAccount, messages: [testMessage] });

      return {
        response: result?.response,
        toolCalls: result?.getToolCalls(),
      };
    },
  );
