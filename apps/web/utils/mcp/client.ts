import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { refreshMcpAccessToken } from "./oauth-utils";
import type { McpConnection } from "@prisma/client";

export type McpClientOptions = {
  integration: IntegrationKey;
  emailAccountId: string;
  refreshTokens?: boolean;
};

/**
 * Generic client for connecting to any MCP server (OAuth or API token based)
 */
export class McpClient {
  private readonly integration: IntegrationKey;
  private readonly emailAccountId: string;
  private readonly refreshTokens: boolean;
  private readonly logger: Logger;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(options: McpClientOptions) {
    this.integration = options.integration;
    this.emailAccountId = options.emailAccountId;
    this.refreshTokens = options.refreshTokens ?? true;
    this.logger = createScopedLogger("mcp-client").with({
      integration: this.integration,
      emailAccountId: this.emailAccountId,
    });
  }

  /**
   * Connect to the MCP server using stored credentials (OAuth token or API key)
   */
  async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    this.logger.info("Connecting to MCP server");

    const integrationConfig = MCP_INTEGRATIONS[this.integration];
    if (!integrationConfig.serverUrl) {
      throw new Error(`Server URL not configured for ${this.integration}`);
    }

    const bearerToken = await this.getBearerToken();

    this.transport = new StreamableHTTPClientTransport(
      new URL(integrationConfig.serverUrl),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
          },
        },
      },
    );

    this.client = new Client({
      name: `inbox-zero-${this.integration}-client`,
      version: "1.0.0",
    });

    await this.client.connect(this.transport);

    this.logger.info("Connected to MCP server");
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * Get bearer token for authorization - either OAuth access token or API key
   */
  private async getBearerToken(): Promise<string> {
    const connection = await prisma.mcpConnection.findFirst({
      where: {
        emailAccountId: this.emailAccountId,
        integration: {
          name: this.integration,
        },
        isActive: true,
      },
      include: {
        integration: true,
      },
    });

    if (!connection) {
      throw new Error(
        `${this.integration} MCP connection not found. Please connect your ${this.integration} workspace first.`,
      );
    }

    const integrationConfig = MCP_INTEGRATIONS[this.integration];

    switch (integrationConfig.authType) {
      case "api-token":
        return this.getBearerTokenFromApiToken(connection);
      case "oauth":
        return this.getBearerTokenFromOAuth(connection);
      default:
        throw new Error(
          `Unsupported auth type '${integrationConfig.authType}' for ${this.integration}`,
        );
    }
  }

  /**
   * Get bearer token for API-token based connections
   */
  private getBearerTokenFromApiToken(connection: McpConnection): string {
    if (!connection.apiKey) {
      throw new Error(
        `No API key found for ${this.integration} MCP connection.`,
      );
    }
    return connection.apiKey;
  }

  /**
   * Get bearer token for OAuth-based connections, refreshing as needed
   */
  private async getBearerTokenFromOAuth(
    connection: McpConnection,
  ): Promise<string> {
    if (!connection.accessToken) {
      throw new Error(
        `No access token found for ${this.integration} MCP connection.`,
      );
    }

    // Check if OAuth token is expired and refresh if needed
    const now = new Date();
    const isExpired = connection.expiresAt && connection.expiresAt < now;

    if (isExpired && connection.refreshToken && this.refreshTokens) {
      this.logger.info("Refreshing expired OAuth token", {
        connectionId: connection.id,
      });

      const refreshedToken = await refreshMcpAccessToken(
        this.integration,
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
      throw new Error(
        `${this.integration} OAuth token has expired. Please reconnect your ${this.integration} workspace.`,
      );
    }

    return connection.accessToken;
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<
    Array<{ name: string; description?: string; inputSchema?: unknown }>
  > {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error("Failed to connect to MCP server");
    }

    try {
      const result = await this.client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      this.logger.error("Failed to list MCP tools", { error });
      throw new Error(
        `Failed to list tools: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Call a specific MCP tool
   */
  async callTool(
    name: string,
    arguments_?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error("Failed to connect to MCP server");
    }

    try {
      const result = await this.client.callTool({
        name,
        arguments: arguments_ || {},
      });
      return result;
    } catch (error) {
      this.logger.error("MCP tool call failed", {
        error,
        toolName: name,
        arguments: arguments_,
      });
      throw new Error(
        `Tool call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

export function createMcpClient(
  integration: IntegrationKey,
  emailAccountId: string,
): McpClient {
  return new McpClient({ integration, emailAccountId });
}
