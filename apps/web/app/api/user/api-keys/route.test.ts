vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { getMcpServerAccessMock } = vi.hoisted(() => ({
  getMcpServerAccessMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/mcp/access", () => ({
  getMcpServerAccess: getMcpServerAccessMock,
}));
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
      handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
    ) =>
    (request: NextRequest, ...args: unknown[]) => {
      const requestWithAuth = Object.assign(request, {
        auth: {
          userId: "user_1",
          emailAccountId: "account_1",
          email: "user@example.com",
        },
      });

      return handler(requestWithAuth, ...args);
    },
}));

import { GET } from "./route";

describe("user/api-keys route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: "key_1",
        name: "Management key",
        createdAt: new Date("2026-04-07T00:00:00.000Z"),
        expiresAt: null,
        lastUsedAt: null,
        scopes: ["RULES_READ"],
      },
    ] as never);
    getMcpServerAccessMock.mockResolvedValue({
      available: true,
      enabled: false,
    });
  });

  it("returns API keys together with MCP access flags", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/api-keys"),
      {} as never,
    );

    expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
      where: { userId: "user_1", emailAccountId: "account_1", isActive: true },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        scopes: true,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(getMcpServerAccessMock).toHaveBeenCalledWith("user_1");
    await expect(response.json()).resolves.toEqual({
      apiKeys: [
        {
          id: "key_1",
          name: "Management key",
          createdAt: "2026-04-07T00:00:00.000Z",
          expiresAt: null,
          lastUsedAt: null,
          scopes: ["RULES_READ"],
        },
      ],
      mcpServerAvailable: true,
      mcpServerEnabled: false,
    });
  });
});
