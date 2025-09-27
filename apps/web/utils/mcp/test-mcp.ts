import type { IntegrationKey } from "@/utils/mcp/integrations";
import { createScopedLogger } from "@/utils/logger";
import { createMcpClient } from "@/utils/mcp/client";

export async function testMcpConnection(
  integration: IntegrationKey,
  emailAccountId: string,
): Promise<{
  connected: boolean;
  error?: string;
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  debug?: {
    toolsCount?: number;
    connectionDetails?: unknown;
  };
}> {
  const logger = createScopedLogger("mcp-connection-test").with({
    integration,
    emailAccountId,
  });

  const client = createMcpClient(integration, emailAccountId);

  try {
    logger.info("Testing MCP connection");

    await client.connect();

    const tools = await client.listTools();

    logger.info("MCP connection test successful", { toolsCount: tools.length });

    await client.disconnect();

    return {
      connected: true,
      tools,
      debug: {
        toolsCount: tools.length,
        connectionDetails: {
          integration,
          emailAccountId,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    logger.error("MCP connection test failed", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error,
    });

    try {
      await client.disconnect();
    } catch {
      // Ignore cleanup errors
    }

    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
