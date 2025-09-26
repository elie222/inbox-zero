import pRetry from "p-retry";
import type {
  CredentialBundle,
  McpClient,
  McpToolInfo,
  ToolCallResult,
} from "./types";

// Simple HTTP-based MCP client for servers exposing tools/list and tools/call
export class HttpMcpClient implements McpClient {
  private readonly baseUrl: string;
  private readonly credentials?: CredentialBundle;

  constructor(baseUrl: string, credentials?: CredentialBundle) {
    this.baseUrl = baseUrl;
    this.credentials = credentials;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.credentials?.accessToken)
      headers.authorization = `Bearer ${this.credentials.accessToken}`;
    if (this.credentials?.apiKey)
      headers["x-api-key"] = this.credentials.apiKey as string;
    return headers;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const url = new URL("tools/list", this.baseUrl).toString();
    const response = await pRetry(
      () => fetch(url, { headers: this.headers() }),
      { retries: 2 },
    );
    if (!response.ok) throw new Error(`tools/list failed: ${response.status}`);
    const data = await response.json();
    return data.tools ?? [];
  }

  async callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const url = new URL("tools/call", this.baseUrl).toString();
    const response = await pRetry(
      () =>
        fetch(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ name, arguments: args ?? {} }),
        }),
      { retries: 2 },
    );

    if (!response.ok) {
      return {
        ok: false,
        error: { message: `tools/call failed: ${response.status}` },
      };
    }
    const data = await response.json();
    return { ok: true, result: data };
  }
}
