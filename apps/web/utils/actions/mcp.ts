"use server";

import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import {
  syncMcpToolsBody,
  callMcpToolBody,
  connectMcpBody,
  disconnectMcpBody,
} from "@/utils/actions/mcp.validation";
import prisma from "@/utils/prisma";
import { McpOrchestrator, MCP_INTEGRATIONS } from "@inboxzero/mcp";
import { revalidatePath } from "next/cache";

export const syncMcpToolsAction = actionClient
  .metadata({ name: "syncMcpTools" })
  .schema(syncMcpToolsBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.mcpConnection.findFirst({
        where: { id: connectionId, emailAccountId },
        include: { integration: true },
      });

      if (!connection) {
        throw new Error("Connection not found");
      }

      const orchestrator = new McpOrchestrator(async () => [
        {
          id: connection.id,
          integrationName: connection.integration.name,
          serverUrl: connection.integration.serverUrl,
          npmPackage: connection.integration.npmPackage,
          approvedTools: connection.approvedTools,
          credentials: {
            accessToken: connection.accessToken,
            refreshToken: connection.refreshToken,
            apiKey: connection.apiKey,
            expiresAt: connection.expiresAt,
          },
          isActive: connection.isActive,
        },
      ]);

      const tools = await orchestrator.listTools();

      // Upsert tools for this connection
      await Promise.all(
        tools.map((t) =>
          prisma.mcpTool.upsert({
            where: {
              connectionId_name: {
                connectionId,
                name: t.name.split(":")[1] ?? t.name,
              },
            },
            update: {
              title: t.title,
              description: t.description,
              schema: t.schema as Record<string, unknown>,
              isEnabled: true,
            },
            create: {
              connectionId,
              name: t.name.split(":")[1] ?? t.name,
              title: t.title,
              description: t.description,
              schema: t.schema as Record<string, unknown>,
            },
          }),
        ),
      );

      const updated = await prisma.mcpTool.findMany({
        where: { connectionId },
      });

      revalidatePath("/mcp");
      return { tools: updated };
    },
  );

export const callMcpToolAction = actionClientUser
  .metadata({ name: "callMcpTool" })
  .schema(callMcpToolBody)
  .action(async ({ ctx: { userId }, parsedInput: { name, args } }) => {
    const connections = await prisma.mcpConnection.findMany({
      where: { userId, isActive: true },
      include: { integration: true },
    });

    const orchestrator = new McpOrchestrator(async () =>
      connections.map((c) => ({
        id: c.id,
        integrationName: c.integration.name,
        serverUrl: c.integration.serverUrl,
        npmPackage: c.integration.npmPackage,
        approvedTools: c.approvedTools,
        credentials: {
          accessToken: c.accessToken,
          refreshToken: c.refreshToken,
          apiKey: c.apiKey,
          expiresAt: c.expiresAt,
        },
        isActive: c.isActive,
      })),
    );

    const result = await orchestrator.callTool(name, args);

    if (!result.ok) {
      throw new Error(result.error || "Failed to call MCP tool");
    }

    return result;
  });

export const connectMcpAction = actionClient
  .metadata({ name: "connectMcp" })
  .schema(connectMcpBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { integrationName, name, apiKey },
    }) => {
      let integration = await prisma.mcpIntegration.findUnique({
        where: { name: integrationName },
      });

      if (!integration) {
        const reg =
          MCP_INTEGRATIONS[integrationName as keyof typeof MCP_INTEGRATIONS];
        if (!reg) {
          throw new Error("Unknown integration");
        }

        integration = await prisma.mcpIntegration.create({
          data: {
            name: reg.name,
            displayName: reg.displayName,
            description: reg.description,
            serverUrl: reg.serverUrl,
            npmPackage: reg.npmPackage,
            authType: reg.authType,
            defaultScopes: reg.defaultScopes,
          },
        });
      }

      const connection = await prisma.mcpConnection.upsert({
        where: {
          emailAccountId_integrationId: {
            emailAccountId,
            integrationId: integration.id,
          },
        },
        update: {
          name,
          apiKey: apiKey ?? undefined,
          isActive: true,
        },
        create: {
          emailAccountId,
          integrationId: integration.id,
          name,
          apiKey: apiKey ?? undefined,
          approvedScopes: integration.defaultScopes,
          approvedTools: [],
        },
        include: { integration: true },
      });

      revalidatePath("/mcp");
      return { connection };
    },
  );

export const disconnectMcpAction = actionClient
  .metadata({ name: "disconnectMcp" })
  .schema(disconnectMcpBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { integrationName } }) => {
      const integration = await prisma.mcpIntegration.findUnique({
        where: { name: integrationName },
      });

      if (!integration) {
        throw new Error("Unknown integration");
      }

      const existing = await prisma.mcpConnection.findFirst({
        where: { emailAccountId, integrationId: integration.id },
      });

      if (existing) {
        await prisma.$transaction([
          prisma.mcpTool.deleteMany({ where: { connectionId: existing.id } }),
          prisma.mcpConnection.delete({ where: { id: existing.id } }),
        ]);
      }

      revalidatePath("/mcp");
      return { ok: true };
    },
  );
