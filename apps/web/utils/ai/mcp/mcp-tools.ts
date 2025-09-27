import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { IntegrationKey } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { refreshMcpAccessToken } from "@/utils/mcp/oauth-utils";

/**
 * Create MCP tools for AI SDK agent
 */
export async function createMcpToolsForAgent(emailAccountId: string) {
  const logger = createScopedLogger("ai-mcp-tools").with({ emailAccountId });

  try {
    // Get all active MCP connections with enabled tools
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

    if (connections.length === 0) {
      logger.info("No active MCP connections with tools found");
      return {};
    }

    logger.info("Creating MCP clients for AI agent", {
      connectionsCount: connections.length,
      totalEnabledTools: connections.reduce(
        (sum, conn) => sum + conn.tools.length,
        0,
      ),
    });

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
        logger.info("Getting access token for integration", {
          integration: integration.name,
          connectionId: connection.id,
        });

        // Get valid access token (with refresh if needed)
        const accessToken = await getValidAccessToken(connection, logger);

        logger.info("Creating MCP transport", {
          integration: integration.name,
          serverUrl: integration.serverUrl,
          hasAccessToken: !!accessToken,
        });

        // Create HTTP transport with OAuth token
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

        logger.info("Creating experimental MCP client", {
          integration: integration.name,
        });

        // Create MCP client for AI SDK
        const mcpClient = await experimental_createMCPClient({
          transport,
        });

        logger.info("Fetching tools from MCP client", {
          integration: integration.name,
        });

        // Get tools from this connection
        const mcpTools = await mcpClient.tools();

        logger.info("Successfully got MCP tools", {
          integration: integration.name,
          toolsFromMcp: Object.keys(mcpTools).length,
        });

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

        logger.info("Added MCP tools for integration", {
          integration: integration.name,
          toolsAdded: Object.keys(filteredTools).length,
          enabledTools: enabledToolNames,
        });

        // Store client for cleanup (we'll handle this in the calling function)
        (allTools as Record<string, unknown>)[`_client_${integration.name}`] =
          mcpClient;
      } catch (error) {
        console.error(error);
        logger.error("Failed to create MCP client for integration", {
          error: error instanceof Error ? error.message : String(error),
          integration: integration.name,
        });
        // Continue with other integrations
      }
    }

    return allTools;
  } catch (error) {
    logger.error("Failed to create MCP tools for agent", {
      error,
    });
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
  logger: Logger,
): Promise<string> {
  if (!connection.accessToken) {
    throw new Error("No access token found");
  }

  // Check if token is expired
  const now = new Date();
  const isExpired = connection.expiresAt && connection.expiresAt < now;

  if (isExpired && connection.refreshToken) {
    logger.info("Refreshing expired MCP token for AI agent", {
      connectionId: connection.id,
      integration: connection.integration.name,
    });

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

  if (isExpired) {
    throw new Error("Access token has expired and no refresh token available");
  }

  return connection.accessToken;
}

/**
 * Clean up MCP clients after use
 */
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
