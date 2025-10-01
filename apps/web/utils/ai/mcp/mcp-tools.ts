import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getIntegration } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getValidAccessToken } from "@/utils/mcp/oauth";

type MCPClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

export type MCPToolsResult = {
  tools: Record<string, unknown>;
  cleanup: () => Promise<void>;
};

export async function createMcpToolsForAgent(
  emailAccountId: string,
): Promise<MCPToolsResult> {
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
      select: {
        id: true,
        emailAccountId: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        integration: {
          select: {
            id: true,
            name: true,
            registeredServerUrl: true,
          },
        },
        tools: {
          where: { isEnabled: true },
          select: {
            name: true,
          },
        },
      },
    });

    if (connections.length === 0) {
      return {
        tools: {},
        cleanup: async () => {},
      };
    }

    const allTools: Record<string, unknown> = {};
    const clients: MCPClient[] = [];

    // Create MCP client for each connection and get tools
    for (const connection of connections) {
      const integration = connection.integration;
      const integrationConfig = getIntegration(integration.name);

      if (!integrationConfig) {
        logger.warn("Integration config not found", {
          integration: integration.name,
        });
        continue;
      }

      if (
        integrationConfig.authType !== "oauth" ||
        !integrationConfig.serverUrl
      ) {
        logger.warn("Skipping non-OAuth or missing serverUrl integration", {
          integration: integration.name,
        });
        continue;
      }

      try {
        const accessToken = await getValidAccessToken({
          integration: integration.name,
          emailAccountId,
        });

        // Use registered server URL if available, otherwise fall back to config
        const serverUrl =
          integration.registeredServerUrl ?? integrationConfig.serverUrl;
        if (!serverUrl) {
          logger.warn("No server URL available", {
            integration: integration.name,
          });
          continue;
        }

        const transport = new StreamableHTTPClientTransport(
          new URL(serverUrl),
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
        clients.push(mcpClient);

        const mcpTools = await mcpClient.tools();

        // Filter to only enabled tools
        const enabledToolNames = connection.tools.map((tool) => tool.name);
        const filteredTools = Object.fromEntries(
          Object.entries(mcpTools).filter(([toolName]) =>
            enabledToolNames.includes(toolName),
          ),
        );

        // Merge tools
        Object.entries(filteredTools).forEach(([toolName, toolDef]) => {
          allTools[toolName] = toolDef;
        });
      } catch (error) {
        logger.error("Failed to create MCP client for integration", {
          error: error instanceof Error ? error.message : String(error),
          integration: integration.name,
        });
        // Continue with other integrations
      }
    }

    return {
      tools: allTools,
      cleanup: async () => {
        await Promise.all(
          clients.map(async (client) => {
            try {
              await client.close();
            } catch (error) {
              logger.warn("Error closing MCP client", { error });
            }
          }),
        );
      },
    };
  } catch (error) {
    logger.error("Failed to create MCP tools for agent", { error });
    return {
      tools: {},
      cleanup: async () => {},
    };
  }
}
