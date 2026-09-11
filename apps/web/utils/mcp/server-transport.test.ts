import { beforeEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpServerRequest } from "@/utils/mcp/server";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/mcp/access", () => ({
  isMcpServerEnabledForUser: vi.fn(async () => true),
}));
vi.mock("@/utils/premium/server", () => ({
  assertCanUseDigestsIfNeeded: vi.fn(),
}));
vi.mock("@/utils/rule/rule", () => ({
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/app/api/user/stats/by-period/controller", () => ({
  getStatsByPeriod: vi.fn(),
}));
vi.mock("@/utils/stats/response-time/controller", () => ({
  getResponseTimeStats: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("initializes a real MCP client and handles scoped tool calls over stateless HTTP", async () => {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/api/mcp-server"),
    {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        if (request.method !== "POST")
          return new Response(null, { status: 405 });
        return handleMcpServerRequest(request, {
          userId: "owner",
          scopes: ["mcp:read"],
        });
      },
    },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain(
      "list_email_accounts",
    );
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "inbox",
        email: "owner@example.com",
        name: null,
        account: { provider: "google" },
      },
    ] as never);
    const accounts = await client.callTool({
      name: "list_email_accounts",
      arguments: {},
    });
    expect(accounts.isError).not.toBe(true);
    expect(accounts.structuredContent).toEqual({
      accounts: [
        {
          id: "inbox",
          email: "owner@example.com",
          name: null,
          provider: "google",
        },
      ],
    });
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "owner" } }),
    );
    const denied = await client.callTool({
      name: "delete_rule",
      arguments: { id: "rule", emailAccountId: "inbox" },
    });
    expect(denied.isError).toBe(true);
    expect(prisma.rule.findFirst).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});
