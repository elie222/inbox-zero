/**
 * Example: Using MCP Client in Next.js Server Actions or API Routes
 *
 * This shows how to use the official MCP SDK with @inboxzero/mcp helpers
 * to create authenticated connections to MCP servers.
 *
 * NOTE: This is an example file. Replace commented imports with your actual implementations.
 */

// biome-ignore-all lint: Example file with placeholder code

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHeaders } from "@inboxzero/mcp";
import type { McpIntegrationConfig } from "@inboxzero/mcp";

// Import your implementations
// import { storage } from '@/lib/mcp/storage';
// import { MCP_INTEGRATIONS } from '@/lib/mcp/integrations';

/**
 * Create an authenticated MCP client
 */
export async function createAuthenticatedMcpClient(
  integration: McpIntegrationConfig,
  userId: string,
): Promise<Client> {
  if (!integration.serverUrl) {
    throw new Error(`No server URL configured for ${integration.name}`);
  }

  // Get authenticated headers (auto-refreshes expired tokens)
  const headers = await createMcpHeaders(
    integration,
    userId,
    storage, // Your storage implementation
    console, // Optional: your logger
  );

  // Create transport with authenticated headers
  const transport = new StreamableHTTPClientTransport(
    new URL(integration.serverUrl),
    {
      requestInit: { headers },
    },
  );

  // Create and connect MCP client
  const client = new Client({
    name: "my-app",
    version: "1.0.0",
  });

  await client.connect(transport);

  return client;
}

/**
 * Example: Search Notion in a Server Action
 */
export async function searchNotionAction(userId: string, query: string) {
  "use server";

  const integration = MCP_INTEGRATIONS.notion;
  const client = await createAuthenticatedMcpClient(integration, userId);

  try {
    // List available tools
    const tools = await client.listTools();
    console.log("Available tools:", tools);

    // Call a tool
    const result = await client.callTool({
      name: "notion-search",
      arguments: { query },
    });

    return result;
  } finally {
    // Always close the client
    await client.close();
  }
}

/**
 * Example: Use in API Route
 */
export async function GET(request: Request) {
  // Get userId from your auth
  const userId = "user-123"; // Replace with actual user ID

  const integration = MCP_INTEGRATIONS.notion;
  const client = await createAuthenticatedMcpClient(integration, userId);

  try {
    const tools = await client.listTools();

    return Response.json({ tools });
  } catch (error) {
    console.error("MCP error:", error);
    return Response.json(
      { error: "Failed to fetch MCP tools" },
      { status: 500 },
    );
  } finally {
    await client.close();
  }
}
