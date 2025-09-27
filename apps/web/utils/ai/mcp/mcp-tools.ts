import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { IntegrationKey } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { refreshMcpAccessToken } from "@/utils/mcp/oauth-utils";

export async function createMcpToolsForAgent(emailAccountId: string) {
  const logger = createScopedLogger("ai-mcp-tools").with({ emailAccountId });

  try {
    const connections = await prisma.mcpConnection.findMany({
      where: {
        emailAccountId,
        isActive: true,
        tools: {
          some: {
            isEnabled: true,
          },
        },
      },
      include: {
        integration: true,
        tools: {
          where: { isEnabled: true },
        },
      },
    });

    if (connections.length === 0) return {};

    const allTools: Record<string, unknown> = {};

    // Create MCP client for each connection and get tools
    for (const connection of connections) {
      const integration = connection.integration;

      if (integration.authType !== "oauth" || !integration.serverUrl) {
        logger.warn("Skipping non-OAuth or missing serverUrl integration", {
          integration: integration.name,
        });
        continue;
      }

      try {
        const accessToken = await getValidAccessToken(connection);

        const transport = new StreamableHTTPClientTransport(
          new URL(integration.serverUrl),
          {
            requestInit: {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            },
          },
        );

        const mcpClient = await experimental_createMCPClient({ transport });

        const mcpTools = await mcpClient.tools();

        // Filter to only enabled tools
        const enabledToolNames = connection.tools.map((tool) => tool.name);
        const filteredTools = Object.fromEntries(
          Object.entries(mcpTools).filter(([toolName]) =>
            enabledToolNames.includes(toolName),
          ),
        );

        // Merge tools with prefix to avoid conflicts
        Object.entries(filteredTools).forEach(([toolName, toolDef]) => {
          allTools[toolName] = toolDef;
        });

        // Store client for cleanup (we'll handle this in the calling function)
        (allTools as Record<string, unknown>)[`_client_${integration.name}`] =
          mcpClient;
      } catch (error) {
        logger.error("Failed to create MCP client for integration", {
          error: error instanceof Error ? error.message : String(error),
          integration: integration.name,
        });
        // Continue with other integrations
      }
    }

    return allTools;
  } catch (error) {
    logger.error("Failed to create MCP tools for agent", { error });
    return {};
  }
}

type McpConnectionWithIntegration = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  integration: {
    name: string;
  };
};

/**
 * Get valid access token, refreshing if needed
 */
async function getValidAccessToken(
  connection: McpConnectionWithIntegration,
): Promise<string> {
  if (!connection.accessToken) throw new Error("No access token found");

  const now = new Date();
  const isExpired = connection.expiresAt && connection.expiresAt < now;

  if (isExpired && connection.refreshToken) {
    const refreshedToken = await refreshMcpAccessToken(
      connection.integration.name as IntegrationKey,
      connection.refreshToken,
    );

    // Update the connection with new tokens
    await prisma.mcpConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshedToken.access_token,
        refreshToken: refreshedToken.refresh_token || connection.refreshToken,
        expiresAt: refreshedToken.expires_in
          ? new Date(Date.now() + refreshedToken.expires_in * 1000)
          : connection.expiresAt,
        updatedAt: new Date(),
      },
    });

    return refreshedToken.access_token;
  }

  if (isExpired)
    throw new Error("Access token has expired and no refresh token available");

  return connection.accessToken;
}

export async function cleanupMcpClients(
  tools: Record<string, unknown>,
  logger: Logger,
) {
  const clientEntries = Object.entries(tools).filter(([key]) =>
    key.startsWith("_client_"),
  );

  await Promise.all(
    clientEntries.map(async ([, client]) => {
      try {
        await (client as any).close();
      } catch (error) {
        logger.warn("Error closing MCP client", { error });
      }
    }),
  );
}
