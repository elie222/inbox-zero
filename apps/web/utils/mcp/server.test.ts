import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connect,
  handleRequest,
  mcpServerConstructor,
  registerTool,
  transportConstructor,
} = vi.hoisted(() => {
  const registerTool = vi.fn();
  const connect = vi.fn();
  const handleRequest = vi.fn();
  const mcpServerConstructor = vi.fn(
    class MockMcpServer {
      registerTool = registerTool;
      connect = connect;
    },
  );
  const transportConstructor = vi.fn(
    class MockTransport {
      handleRequest = handleRequest;
    },
  );

  return {
    connect,
    handleRequest,
    mcpServerConstructor,
    registerTool,
    transportConstructor,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: mcpServerConstructor,
}));
vi.mock(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  () => ({
    WebStandardStreamableHTTPServerTransport: transportConstructor,
  }),
);
vi.mock("@/app/api/user/stats/by-period/controller", () => ({
  getStatsByPeriod: vi.fn(),
}));
vi.mock("@/app/api/user/stats/response-time/controller", () => ({
  getResponseTimeStats: vi.fn(),
}));
vi.mock("@/app/api/v1/rules/request", () => ({
  toRuleWriteInput: vi.fn(),
}));
vi.mock("@/app/api/v1/rules/serializers", () => ({
  apiRuleSelect: {},
  serializeRule: vi.fn(),
}));
vi.mock("@/app/api/v1/rules/validation", async (importActual) => {
  const actual =
    await importActual<typeof import("@/app/api/v1/rules/validation")>();
  return actual;
});
vi.mock("@/utils/branding", () => ({
  BRAND_NAME: "Inbox Zero",
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/mcp/access", () => ({
  isMcpServerEnabledForUser: vi.fn(),
}));
vi.mock("@/utils/mcp/account-selection", () => ({
  listMcpEmailAccounts: vi.fn(),
  resolveMcpEmailAccount: vi.fn(),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/rule", () => ({
  createRule: vi.fn(),
  deleteRule: vi.fn(),
  updateRule: vi.fn(),
}));

import { handleMcpServerRequest } from "@/utils/mcp/server";
import { isMcpServerEnabledForUser } from "@/utils/mcp/access";

describe("mcp-server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleRequest.mockResolvedValue(new Response("ok"));
    vi.mocked(isMcpServerEnabledForUser).mockResolvedValue(true);
  });

  it("returns 401 when the MCP access token has no user id", async () => {
    const response = await handleMcpServerRequest(
      new Request("http://localhost/api/mcp-server", { method: "POST" }),
      {} as never,
    );

    expect(response.status).toBe(401);
    expect(mcpServerConstructor).not.toHaveBeenCalled();
  });

  it("registers tools and delegates the request to the MCP transport", async () => {
    const request = new Request("http://localhost/api/mcp-server", {
      method: "POST",
    });

    const response = await handleMcpServerRequest(request, {
      userId: "user_1",
    } as never);

    expect(mcpServerConstructor).toHaveBeenCalledTimes(1);
    expect(registerTool).toHaveBeenCalledTimes(8);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(transportConstructor).toHaveBeenCalledWith({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    expect(handleRequest).toHaveBeenCalledWith(request);
    expect(response).toBeInstanceOf(Response);
  });

  it("returns 403 when MCP access is disabled for the user", async () => {
    vi.mocked(isMcpServerEnabledForUser).mockResolvedValue(false);

    const response = await handleMcpServerRequest(
      new Request("http://localhost/api/mcp-server", { method: "POST" }),
      { userId: "user_1" } as never,
    );

    expect(response.status).toBe(403);
    expect(mcpServerConstructor).not.toHaveBeenCalled();
  });
});
