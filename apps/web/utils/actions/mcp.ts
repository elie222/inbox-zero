"use server";

import { randomUUID } from "node:crypto";
import { actionClient } from "@/utils/actions/safe-action";
import {
  createCustomMcpServerBody,
  disconnectMcpConnectionBody,
  removeCustomMcpServerBody,
  toggleMcpConnectionBody,
  toggleMcpToolBody,
} from "@/utils/actions/mcp.validation";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import { CUSTOM_INTEGRATION_PREFIX } from "@/utils/mcp/resolve-integration";
import { assertIntegrationsTierAccess } from "@/utils/mcp/tier-access";
import { syncMcpTools } from "@/utils/mcp/sync-tools";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";
import prisma from "@/utils/prisma";

const MAX_CUSTOM_SERVERS_PER_ACCOUNT = 10;

export const disconnectMcpConnectionAction = actionClient
  .metadata({ name: "disconnectMcpConnection" })
  .inputSchema(disconnectMcpConnectionBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
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

      const allowPrivateIps = env.MCP_ALLOW_PRIVATE_IPS;

      if (!allowPrivateIps && !serverUrl.startsWith("https://")) {
        throw new SafeError("The server URL must use https");
      }

      if (!isSafeExternalHttpUrl(serverUrl, { allowPrivateIps })) {
        throw new SafeError("That server URL is not a public address");
      }

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
          authType: authType === "api-token" ? "API_TOKEN" : "OAUTH",
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
            apiKey,
            isActive: true,
          },
        });

        await syncMcpTools(name, emailAccountId, logger);
      } catch (error) {
        logger.error("Failed to connect custom MCP server", { error });
        await prisma.mcpIntegration.delete({ where: { id: integration.id } });
        throw new SafeError(
          "Could not connect to the server. Check the URL and API key.",
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
