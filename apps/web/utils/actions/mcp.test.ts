import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  createCustomMcpServerAction,
  testMcpConnectionAction,
} from "@/utils/actions/mcp";
import { createCustomMcpServerBody } from "@/utils/actions/mcp.validation";

const { mockSyncMcpTools } = vi.hoisted(() => ({
  mockSyncMcpTools: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "owner@example.com" },
    session: {},
  })),
}));
vi.mock("@/utils/mcp/sync-tools", () => ({
  syncMcpTools: mockSyncMcpTools,
}));

describe("createCustomMcpServerBody", () => {
  it("requires an API key when the server uses one", () => {
    const result = createCustomMcpServerBody.safeParse({
      displayName: "Docs",
      serverUrl: "https://mcp.example.com/mcp",
      authType: "api-token",
    });

    expect(result.success).toBe(false);
  });

  it("does not require an API key for OAuth servers", () => {
    const result = createCustomMcpServerBody.safeParse({
      displayName: "Docs",
      serverUrl: "https://mcp.example.com/mcp",
      authType: "oauth",
    });

    expect(result.success).toBe(true);
  });
});

describe("custom MCP server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        tier: "PROFESSIONAL_MONTHLY",
        stripeSubscriptionStatus: "active",
      },
    } as never);
    prisma.mcpIntegration.count.mockResolvedValue(0);
    prisma.mcpIntegration.create.mockResolvedValue({
      id: "integration-1",
    } as never);
  });

  it("rejects a server URL that is not https", async () => {
    const result = await createCustomMcpServerAction("account-1", {
      displayName: "Docs",
      serverUrl: "http://mcp.example.com/mcp",
      authType: "oauth",
    });

    expect(result?.serverError).toBe("The server URL must use https");
    expect(prisma.mcpIntegration.create).not.toHaveBeenCalled();
  });

  it("rejects a server URL that resolves to a private address", async () => {
    const result = await createCustomMcpServerAction("account-1", {
      displayName: "Docs",
      serverUrl: "https://10.0.0.1/mcp",
      authType: "oauth",
    });

    expect(result?.serverError).toBe("That server URL is not a public address");
    expect(prisma.mcpIntegration.create).not.toHaveBeenCalled();
  });

  it("removes the server again when the first tool sync fails", async () => {
    mockSyncMcpTools.mockRejectedValue(new Error("connection refused"));

    const result = await createCustomMcpServerAction("account-1", {
      displayName: "Docs",
      serverUrl: "https://mcp.example.com/mcp",
      authType: "api-token",
      apiKey: "secret",
    });

    expect(result?.serverError).toBe(
      "Could not connect to the server. Check the URL and API key.",
    );
    expect(prisma.mcpIntegration.delete).toHaveBeenCalledWith({
      where: { id: "integration-1" },
    });
  });
});

describe("testMcpConnectionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
    prisma.mcpConnection.findUnique.mockResolvedValue({
      isActive: true,
      integration: { name: "notion" },
    } as never);
  });

  it("only tests connections owned by the current email account", async () => {
    prisma.mcpConnection.findUnique.mockResolvedValue(null);

    const result = await testMcpConnectionAction("account-1", {
      connectionId: "other-accounts-connection",
    });

    expect(prisma.mcpConnection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "other-accounts-connection", emailAccountId: "account-1" },
      }),
    );
    expect(result?.serverError).toBe("Connection not found");
    expect(mockSyncMcpTools).not.toHaveBeenCalled();
  });

  it("returns the tool count when the server responds", async () => {
    mockSyncMcpTools.mockResolvedValue({ toolsCount: 5 });

    const result = await testMcpConnectionAction("account-1", {
      connectionId: "connection-1",
    });

    expect(result?.data).toEqual({ toolsCount: 5 });
  });

  it("reports an auth failure when the server rejects the credentials", async () => {
    mockSyncMcpTools.mockRejectedValue(
      new Error("Failed to sync tools", {
        cause: new Error("Failed to list tools", {
          cause: new StreamableHTTPError(401, "Unauthorized"),
        }),
      }),
    );

    const result = await testMcpConnectionAction("account-1", {
      connectionId: "connection-1",
    });

    expect(result?.serverError).toBe(
      "Authorization expired or was revoked. Reconnect and try again.",
    );
  });

  it("reports an auth failure when the token refresh deactivated the connection", async () => {
    prisma.mcpConnection.findUnique
      .mockResolvedValueOnce({
        isActive: true,
        integration: { name: "notion" },
      } as never)
      .mockResolvedValueOnce({ isActive: false } as never);
    mockSyncMcpTools.mockRejectedValue(new Error("no longer authorized"));

    const result = await testMcpConnectionAction("account-1", {
      connectionId: "connection-1",
    });

    expect(result?.serverError).toBe(
      "Authorization expired or was revoked. Reconnect and try again.",
    );
  });

  it("reports an unreachable server for other failures", async () => {
    mockSyncMcpTools.mockRejectedValue(
      new Error("Failed to sync tools", { cause: new Error("ECONNREFUSED") }),
    );

    const result = await testMcpConnectionAction("account-1", {
      connectionId: "connection-1",
    });

    expect(result?.serverError).toBe(
      "Could not reach the server. Check that it is online and try again.",
    );
  });
});
