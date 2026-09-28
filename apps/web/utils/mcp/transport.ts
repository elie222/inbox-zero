import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConnection } from "@/utils/mcp/server-connection";

export function createMcpTransport({
  url,
  headers,
  fetch,
}: McpServerConnection): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(url), {
    fetch,
    requestInit: {
      headers: { ...headers, "Content-Type": "application/json" },
    },
  });
}
