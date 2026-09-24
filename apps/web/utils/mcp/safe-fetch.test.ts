import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedMcpIntegration } from "@/utils/mcp/resolve-integration";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { MCP_ALLOW_PRIVATE_IPS: false },
}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { getMcpFetch } from "./safe-fetch";

describe("getMcpFetch", () => {
  let server: Server | undefined;

  beforeEach(() => {
    mockEnv.MCP_ALLOW_PRIVATE_IPS = false;
  });

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  it("leaves built-in integrations on the default fetch", () => {
    expect(getMcpFetch(integration({ isCustom: false }))).toBeUndefined();
  });

  it("refuses private addresses", async () => {
    await expect(safeFetch()("https://10.0.0.1/mcp")).rejects.toThrow(
      "not a public address",
    );
  });

  it("requires https", async () => {
    await expect(safeFetch()("http://93.184.216.34/mcp")).rejects.toThrow(
      "must use https",
    );
  });

  it("refuses to follow redirects", async () => {
    mockEnv.MCP_ALLOW_PRIVATE_IPS = true;
    const url = await startServer((_request, response) => {
      response.writeHead(302, { Location: "http://169.254.169.254/" });
      response.end();
    });

    await expect(safeFetch()(url)).rejects.toThrow("redirect");
  });

  it("allows private http targets when the flag is set", async () => {
    mockEnv.MCP_ALLOW_PRIVATE_IPS = true;
    const url = await startServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
    });

    const response = await safeFetch()(url);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
  });

  function safeFetch() {
    const fetchFn = getMcpFetch(integration({ isCustom: true }));
    if (!fetchFn) throw new Error("Expected a guarded fetch");
    return fetchFn;
  }

  async function startServer(
    handler: Parameters<typeof createServer>[1],
  ): Promise<string> {
    server = createServer(handler);
    await new Promise<void>((resolve) =>
      server?.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/mcp`;
  }
});

function integration({
  isCustom,
}: {
  isCustom: boolean;
}): ResolvedMcpIntegration {
  return {
    name: "custom_abc",
    displayName: "Knowledge base",
    serverUrl: "https://mcp.example.com/mcp",
    authType: "api-token",
    scopes: [],
    isCustom,
  };
}
