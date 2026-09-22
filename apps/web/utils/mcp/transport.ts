import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

export function createMcpTransport(
  serverUrl: string,
  accessToken: string,
  options?: { fetch?: FetchLike },
): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(serverUrl), {
    fetch: options?.fetch,
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  });
}
