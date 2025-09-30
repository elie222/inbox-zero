/**
 * MCP Client wrapper for the web app
 * Uses the official MCP SDK with @inboxzero/mcp helpers for authentication
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHeaders } from "@inboxzero/mcp";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";
import { credentialStorage } from "@/utils/mcp/storage-adapter";
import { env } from "@/env";
import { createScopedLogger, type Logger } from "@/utils/logger";

/**
 * Get static OAuth client credentials from environment variables (if available)
 */
function getStaticCredentials(integration: IntegrationKey) {
  switch (integration) {
    case "notion":
      return {
        clientId: env.NOTION_MCP_CLIENT_ID,
        clientSecret: env.NOTION_MCP_CLIENT_SECRET,
      };
    case "hubspot":
      return {
        clientId: env.HUBSPOT_MCP_CLIENT_ID,
        clientSecret: env.HUBSPOT_MCP_CLIENT_SECRET,
      };
    case "monday":
      return {
        clientId: env.MONDAY_MCP_CLIENT_ID,
        clientSecret: env.MONDAY_MCP_CLIENT_SECRET,
      };
    default:
      return undefined;
  }
}

export type McpClientOptions = {
  integration: IntegrationKey;
  emailAccountId: string;
  refreshTokens?: boolean;
};

/**
 * MCP Client wrapper for the web app
 * Combines official MCP SDK with our auth helpers
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
    this.logger = createScopedLogger("mcp-client");
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    const integrationConfig = MCP_INTEGRATIONS[this.integration];

    if (!integrationConfig.serverUrl) {
      throw new Error(`No server URL for integration: ${this.integration}`);
    }

    // Get authenticated headers using our package helper
    const headers = await createMcpHeaders(
      integrationConfig,
      this.emailAccountId,
      credentialStorage,
      this.logger,
      {
        autoRefresh: this.refreshTokens,
        staticCredentials: getStaticCredentials(this.integration),
      },
    );

    // Use official MCP SDK
    this.transport = new StreamableHTTPClientTransport(
      new URL(integrationConfig.serverUrl),
      { requestInit: { headers } },
    );

    this.client = new Client({
      name: `inbox-zero-${this.integration}`,
      version: "1.0.0",
    });

    await this.client.connect(this.transport);

    this.logger.info("Connected to MCP server", {
      integration: this.integration,
    });
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    this.logger.trace("Disconnected from MCP server", {
      integration: this.integration,
    });
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

/**
 * Factory function to create an MCP client
 */
export function createMcpClient(
  integration: IntegrationKey,
  emailAccountId: string,
): McpClient {
  return new McpClient({ integration, emailAccountId });
}
