import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMcpToolsForAgent } from "./mcp-tools";

const { mockCreateMCPClient, mockGetAuthToken, mockCreateMcpTransport } =
  vi.hoisted(() => ({
    mockCreateMCPClient: vi.fn(),
    mockGetAuthToken: vi.fn(),
    mockCreateMcpTransport: vi.fn(),
  }));

vi.mock("@/utils/prisma");

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: mockCreateMCPClient,
}));

vi.mock("@/utils/mcp/oauth", () => ({
  getAuthToken: mockGetAuthToken,
}));

vi.mock("@/utils/mcp/transport", () => ({
  createMcpTransport: mockCreateMcpTransport,
}));

type ConnectionRow = {
  id: string;
  integration: { id: string; name: string };
  tools: { name: string }[];
};

function mockConnections(connections: ConnectionRow[]) {
  prisma.mcpConnection.findMany.mockResolvedValue(
    connections as unknown as Awaited<
      ReturnType<typeof prisma.mcpConnection.findMany>
    >,
  );
}

describe("createMcpToolsForAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthToken.mockResolvedValue("auth-token");
    mockCreateMcpTransport.mockReturnValue({});
    mockCreateMCPClient.mockResolvedValue({
      tools: vi.fn().mockResolvedValue({
        "notion-search": { description: "search" },
      }),
      close: vi.fn(),
    });
  });

  it("connects to the integration MCP server URL", async () => {
    mockConnections([
      {
        id: "connection-1",
        integration: { id: "integration-1", name: "notion" },
        tools: [{ name: "notion-search" }],
      },
    ]);

    const result = await createMcpToolsForAgent("email-account-1");

    // The MCP endpoint keeps its /mcp suffix (unlike the OAuth discovery URL)
    expect(mockCreateMcpTransport).toHaveBeenCalledWith(
      "https://mcp.notion.com/mcp",
      "auth-token",
    );
    expect(Object.keys(result.tools)).toEqual(["notion-search"]);
  });

  it("skips connections for unknown integrations without dropping the rest", async () => {
    mockConnections([
      {
        id: "connection-1",
        integration: { id: "integration-1", name: "removed-integration" },
        tools: [{ name: "some-tool" }],
      },
      {
        id: "connection-2",
        integration: { id: "integration-2", name: "notion" },
        tools: [{ name: "notion-search" }],
      },
    ]);

    const result = await createMcpToolsForAgent("email-account-1");

    expect(mockCreateMcpTransport).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.tools)).toEqual(["notion-search"]);
  });

  it("only queries read tools and never exposes server write tools to the agent", async () => {
    // The DB rows only contain read tools (query excludes isWrite), so a write
    // tool advertised by the MCP server must be dropped by the name filter.
    mockConnections([
      {
        id: "connection-1",
        integration: { id: "integration-1", name: "notion" },
        tools: [{ name: "notion-search" }],
      },
    ]);
    mockCreateMCPClient.mockResolvedValue({
      tools: vi.fn().mockResolvedValue({
        "notion-search": { description: "search" },
        "notion-create-pages": { description: "write tool" },
      }),
      close: vi.fn(),
    });

    const result = await createMcpToolsForAgent("email-account-1");

    expect(prisma.mcpConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tools: { some: { isEnabled: true, isWrite: false } },
        }),
        select: expect.objectContaining({
          tools: expect.objectContaining({
            where: { isEnabled: true, isWrite: false },
          }),
        }),
      }),
    );
    expect(Object.keys(result.tools)).toEqual(["notion-search"]);
  });

  it("continues with other integrations when one client fails", async () => {
    mockConnections([
      {
        id: "connection-1",
        integration: { id: "integration-1", name: "pipedream" },
        tools: [{ name: "app-list-items" }],
      },
      {
        id: "connection-2",
        integration: { id: "integration-2", name: "notion" },
        tools: [{ name: "notion-search" }],
      },
    ]);
    mockCreateMCPClient
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce({
        tools: vi.fn().mockResolvedValue({
          "notion-search": { description: "search" },
        }),
        close: vi.fn(),
      });

    const result = await createMcpToolsForAgent("email-account-1");

    expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.tools)).toEqual(["notion-search"]);
  });
});
