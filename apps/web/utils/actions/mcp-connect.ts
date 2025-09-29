"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { connectMcpApiTokenBody } from "@/utils/actions/mcp-connect.validation";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";

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
            description: integrationConfig.description,
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

      let connection: any;
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

      return {
        connectionId: connection.id,
        message: `Successfully connected to ${integrationConfig.displayName}`,
      };
    },
  );
