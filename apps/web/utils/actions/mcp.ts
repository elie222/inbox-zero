"use server";

import { randomUUID } from "node:crypto";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { actionClient } from "@/utils/actions/safe-action";
import {
  createCustomMcpServerBody,
  disconnectMcpConnectionBody,
  removeCustomMcpServerBody,
  testMcpConnectionBody,
  toggleMcpConnectionBody,
  toggleMcpToolBody,
} from "@/utils/actions/mcp.validation";
import { SafeError } from "@/utils/error";
import {
  CUSTOM_INTEGRATION_PREFIX,
  toDbAuthType,
} from "@/utils/mcp/resolve-integration";
import { assertIntegrationsTierAccess } from "@/utils/mcp/tier-access";
import { findIntegration } from "@/utils/mcp/integrations";
import { getIntegrationProvider } from "@/utils/mcp/providers/registry";
import { syncMcpTools } from "@/utils/mcp/sync-tools";
import { getCustomMcpServerUrlError } from "@/utils/mcp/safe-fetch";
import prisma from "@/utils/prisma";

const MAX_CUSTOM_SERVERS_PER_ACCOUNT = 10;

export const disconnectMcpConnectionAction = actionClient
  .metadata({ name: "disconnectMcpConnection" })
  .inputSchema(disconnectMcpConnectionBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.mcpConnection.findUnique({
        where: { id: connectionId, emailAccountId },
        select: { integration: { select: { name: true } } },
      });
      if (!connection) throw new SafeError("Connection not found");

      // Revoke at the provider first so it never keeps tokens we no longer track
      const provider = findIntegration(connection.integration.name)?.provider;
      if (provider) {
        await getIntegrationProvider(provider.id).disconnect({
          app: provider.app,
          emailAccountId,
        });
      }

      await prisma.mcpConnection.delete({
        where: { id: connectionId, emailAccountId },
      });
    },
  );

export const toggleMcpConnectionAction = actionClient
  .metadata({ name: "toggleMcpConnection" })
  .inputSchema(toggleMcpConnectionBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { connectionId, isActive },
    }) => {
      await prisma.mcpConnection.update({
        where: { id: connectionId, emailAccountId },
        data: { isActive },
      });
    },
  );

export const testMcpConnectionAction = actionClient
  .metadata({ name: "testMcpConnection" })
  .inputSchema(testMcpConnectionBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { connectionId },
    }) => {
      const connection = await prisma.mcpConnection.findUnique({
        where: { id: connectionId, emailAccountId },
        select: { isActive: true, integration: { select: { name: true } } },
      });
      if (!connection) throw new SafeError("Connection not found");
      if (!connection.isActive) {
        throw new SafeError("Resume this integration to test it.");
      }

      try {
        const { toolsCount } = await syncMcpTools(
          connection.integration.name,
          emailAccountId,
          logger,
        );
        return { toolsCount };
      } catch (error) {
        // A failed token refresh deactivates the connection
        const latest = await prisma.mcpConnection.findUnique({
          where: { id: connectionId, emailAccountId },
          select: { isActive: true },
        });
        throw new SafeError(
          !latest?.isActive || isAuthRejection(error)
            ? "Authorization expired or was revoked. Reconnect and try again."
            : "Could not reach the server. Check that it is online and try again.",
        );
      }
    },
  );

export const toggleMcpToolAction = actionClient
  .metadata({ name: "toggleMcpTool" })
  .inputSchema(toggleMcpToolBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { toolId, isEnabled } }) => {
      await prisma.mcpTool.update({
        where: { id: toolId, connection: { emailAccountId } },
        data: { isEnabled },
      });
    },
  );

export const createCustomMcpServerAction = actionClient
  .metadata({ name: "createCustomMcpServer" })
  .inputSchema(createCustomMcpServerBody)
  .action(
    async ({
      ctx: { emailAccountId, userId, logger },
      parsedInput: { displayName, serverUrl, authType, apiKey },
    }) => {
      await assertIntegrationsTierAccess({ userId, logger });

      const urlError = getCustomMcpServerUrlError(serverUrl);
      if (urlError) throw new SafeError(urlError);

      const existingCount = await prisma.mcpIntegration.count({
        where: { emailAccountId },
      });

      if (existingCount >= MAX_CUSTOM_SERVERS_PER_ACCOUNT) {
        throw new SafeError(
          `You can add up to ${MAX_CUSTOM_SERVERS_PER_ACCOUNT} custom servers.`,
        );
      }

      const name = `${CUSTOM_INTEGRATION_PREFIX}${randomUUID().replace(/-/g, "")}`;

      const integration = await prisma.mcpIntegration.create({
        data: {
          name,
          displayName,
          serverUrl,
          authType: toDbAuthType(authType),
          emailAccountId,
        },
        select: { id: true },
      });

      if (authType === "oauth") return { name };

      try {
        await prisma.mcpConnection.create({
          data: {
            name: displayName,
            emailAccountId,
            integrationId: integration.id,
            apiKey: authType === "api-token" ? apiKey : null,
            isActive: true,
          },
        });

        await syncMcpTools(name, emailAccountId, logger);
      } catch (error) {
        logger.error("Failed to connect custom MCP server", { error });
        await prisma.mcpIntegration.delete({ where: { id: integration.id } });
        throw new SafeError(
          authType === "api-token"
            ? "Could not connect to the server. Check the URL and API key."
            : "Could not connect to the server. Check the URL, or choose an authentication method if the server requires one.",
        );
      }

      return { name };
    },
  );

export const removeCustomMcpServerAction = actionClient
  .metadata({ name: "removeCustomMcpServer" })
  .inputSchema(removeCustomMcpServerBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { name } }) => {
    const { count } = await prisma.mcpIntegration.deleteMany({
      where: { name, emailAccountId },
    });

    if (!count) throw new SafeError("Server not found");
  });

function isAuthRejection(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if (
      current instanceof StreamableHTTPError &&
      (current.code === 401 || current.code === 403)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
