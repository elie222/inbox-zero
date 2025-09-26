import pRetry from "p-retry";
import { HttpMcpClient } from "./client";
import type { CredentialBundle, McpToolInfo, ToolCallResult } from "./types";

export class McpOrchestrator {
  private readonly listConnections: () => Promise<
    Array<{
      id: string;
      integrationName: string;
      serverUrl?: string | null;
      npmPackage?: string | null;
      approvedTools: string[];
      credentials: CredentialBundle;
      isActive: boolean;
    }>
  >;

  constructor(
    listConnections: () => Promise<
      Array<{
        id: string;
        integrationName: string;
        serverUrl?: string | null;
        npmPackage?: string | null;
        approvedTools: string[];
        credentials: CredentialBundle;
        isActive: boolean;
      }>
    >,
  ) {
    this.listConnections = listConnections;
  }

  private clientFor(connection: {
    serverUrl?: string | null;
    npmPackage?: string | null;
    credentials: CredentialBundle;
  }) {
    if (connection.serverUrl) {
      return new HttpMcpClient(connection.serverUrl, connection.credentials);
    }
    // TODO: Support npm-based MCP servers via dynamic import in a future iteration
    throw new Error("npm-based MCP client not implemented yet");
  }

  async listTools(): Promise<McpToolInfo[]> {
    const connections = await this.listConnections();
    const active = connections.filter((c) => c.isActive);
    const results = await Promise.allSettled(
      active.map(async (conn) => {
        const client = this.clientFor(conn);
        const tools = await pRetry(() => client.listTools(), { retries: 2 });
        // Tag tool names with integration prefix to avoid collisions
        const prefix = conn.integrationName;
        return tools.map((t) => ({ ...t, name: `${prefix}:${t.name}` }));
      }),
    );

    const tools: McpToolInfo[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") tools.push(...r.value);
    }
    return tools;
  }

  async callTool(
    qualifiedName: string,
    args?: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const [integrationKey, toolName] = qualifiedName.split(":", 2);
    if (!integrationKey || !toolName) {
      return {
        ok: false,
        error: { message: "Invalid tool name; expected 'integration:tool'" },
      };
    }

    const connections = await this.listConnections();
    const candidates = connections.filter(
      (c) =>
        c.isActive &&
        c.integrationName === integrationKey &&
        (c.approvedTools.length === 0 || c.approvedTools.includes(toolName)),
    );
    if (candidates.length === 0) {
      return {
        ok: false,
        error: {
          message: "No active connection with permission for this tool",
        },
      };
    }

    const connection = candidates[0];
    const client = this.clientFor(connection);
    return await pRetry(() => client.callTool(toolName, args), { retries: 2 });
  }
}
