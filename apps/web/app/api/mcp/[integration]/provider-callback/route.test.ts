import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockCompleteConnection, mockSyncMcpTools } = vi.hoisted(() => ({
  mockCompleteConnection: vi.fn(),
  mockSyncMcpTools: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/mcp/providers/registry", () => ({
  getIntegrationProvider: () => ({
    completeConnection: mockCompleteConnection,
  }),
}));

vi.mock("@/utils/mcp/sync-tools", () => ({
  syncMcpTools: mockSyncMcpTools,
}));

import {
  generateSignedOAuthState,
  getMcpStateCookieName,
} from "@/utils/oauth/state";
import { GET } from "./route";

describe("mcp provider callback route", () => {
  const integration = "hubspot";
  const params = { params: Promise.resolve({ integration }) };

  const createRequest = (cookieState?: string) =>
    new NextRequest(
      `http://localhost:3000/api/mcp/${integration}/provider-callback?status=success`,
      cookieState
        ? {
            headers: {
              cookie: `${getMcpStateCookieName(integration)}=${cookieState}`,
            },
          }
        : undefined,
    );

  const validState = () =>
    generateSignedOAuthState({
      userId: "user-123",
      emailAccountId: "email-account-123",
      type: "hubspot-mcp",
    });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "email-account-123",
    } as Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>);
    prisma.mcpIntegration.upsert.mockResolvedValue({
      id: "integration-1",
    } as Awaited<ReturnType<typeof prisma.mcpIntegration.upsert>>);
    mockCompleteConnection.mockResolvedValue(true);
    mockSyncMcpTools.mockResolvedValue({ toolsCount: 3 });
  });

  it("saves the connection and syncs tools once the provider confirms it", async () => {
    const response = await GET(createRequest(validState()), params);

    const location = response.headers.get("location");
    expect(location).toContain("/email-account-123/integrations");
    expect(location).toContain("connected=hubspot");
    expect(mockCompleteConnection).toHaveBeenCalledWith({
      app: "hubspot",
      emailAccountId: "email-account-123",
    });
    expect(prisma.mcpConnection.upsert).toHaveBeenCalled();
    expect(mockSyncMcpTools).toHaveBeenCalledWith(
      "hubspot",
      "email-account-123",
      expect.anything(),
    );
  });

  it("rejects callbacks without a signed state cookie", async () => {
    const forged = Buffer.from(
      JSON.stringify({
        userId: "user-123",
        emailAccountId: "email-account-123",
        type: "hubspot-mcp",
      }),
    ).toString("base64url");

    for (const cookie of [undefined, forged]) {
      const response = await GET(createRequest(cookie), params);
      expect(response.headers.get("location")).toContain("error=invalid_state");
    }
    expect(mockCompleteConnection).not.toHaveBeenCalled();
    expect(prisma.mcpConnection.upsert).not.toHaveBeenCalled();
  });

  it("rejects state issued for a different integration", async () => {
    const state = generateSignedOAuthState({
      userId: "user-123",
      emailAccountId: "email-account-123",
      type: "salesforce-mcp",
    });

    const response = await GET(createRequest(state), params);

    expect(response.headers.get("location")).toContain("error=invalid_state");
    expect(mockCompleteConnection).not.toHaveBeenCalled();
  });

  it("does not save a connection the provider has not completed", async () => {
    mockCompleteConnection.mockResolvedValue(false);

    const response = await GET(createRequest(validState()), params);

    expect(response.headers.get("location")).toContain(
      "error=connection_failed",
    );
    expect(prisma.mcpConnection.upsert).not.toHaveBeenCalled();
    expect(mockSyncMcpTools).not.toHaveBeenCalled();
  });
});
