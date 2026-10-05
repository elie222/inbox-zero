import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { Prisma } from "@/generated/prisma/client";
import { reduceMcpConnectionScopes, revokeMcpConnection } from "./connections";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("MCP connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes one client without clearing other grants", async () => {
    prisma.oauthConsent.findFirst.mockResolvedValue({
      clientId: "client-1",
    } as never);
    prisma.$transaction.mockResolvedValue([]);

    await revokeMcpConnection({ userId: "user-1", clientId: "client-1" });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.oauthAccessToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
    expect(prisma.oauthRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
    expect(prisma.oauthConsent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects revoking a client the user has not authorized", async () => {
    prisma.oauthConsent.findFirst.mockResolvedValue(null);
    await expect(
      revokeMcpConnection({ userId: "user-1", clientId: "missing" }),
    ).rejects.toThrow("MCP application not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("MCP permission reductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.oauthConsent.findFirst.mockResolvedValue({
      id: "grant-1",
      scopes: ["mcp:read", "mcp:write", "mcp:send"],
    } as never);
    prisma.oauthConsent.update.mockResolvedValue({ id: "grant-1" } as never);
    prisma.$transaction.mockResolvedValue([{ id: "grant-1" }]);
  });

  it("removes sending from the live grant without revoking other clients", async () => {
    const result = await reduceMcpConnectionScopes({
      userId: "user-1",
      clientId: "client-1",
      scopes: ["mcp:read", "mcp:write"],
    });
    expect(result.scopes).toEqual(["mcp:read", "mcp:write"]);
    expect(prisma.oauthConsent.update).toHaveBeenCalledWith({
      where: {
        id: "grant-1",
        userId: "user-1",
        clientId: "client-1",
        scopes: { equals: ["mcp:read", "mcp:write", "mcp:send"] },
      },
      data: { scopes: ["mcp:read", "mcp:write"] },
    });
    expect(prisma.oauthConsent.deleteMany).not.toHaveBeenCalled();
  });

  it("revokes only this client's refresh tokens when offline access is removed", async () => {
    prisma.oauthConsent.findFirst.mockResolvedValue({
      id: "grant-1",
      scopes: ["mcp:read", "offline_access"],
    } as never);
    await reduceMcpConnectionScopes({
      userId: "user-1",
      clientId: "client-1",
      scopes: ["mcp:read"],
    });
    expect(prisma.oauthRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
    expect(prisma.oauthConsent.deleteMany).not.toHaveBeenCalled();
  });

  it("preserves offline tokens when only sending is disabled", async () => {
    prisma.oauthConsent.findFirst.mockResolvedValue({
      id: "grant-1",
      scopes: ["mcp:read", "mcp:send", "offline_access"],
    } as never);
    await reduceMcpConnectionScopes({
      userId: "user-1",
      clientId: "client-1",
      scopes: ["mcp:read", "offline_access"],
    });
    expect(prisma.oauthRefreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects adding access without a fresh OAuth authorization", async () => {
    prisma.oauthConsent.findFirst.mockResolvedValue({
      id: "grant-1",
      scopes: ["mcp:read"],
    } as never);
    await expect(
      reduceMcpConnectionScopes({
        userId: "user-1",
        clientId: "client-1",
        scopes: ["mcp:read", "mcp:send"],
      }),
    ).rejects.toThrow("Reconnect");
    expect(prisma.oauthConsent.update).not.toHaveBeenCalled();
  });

  it("rejects updates to another user's application", async () => {
    prisma.oauthConsent.findFirst.mockResolvedValue(null);
    await expect(
      reduceMcpConnectionScopes({
        userId: "user-1",
        clientId: "client-2",
        scopes: ["mcp:read"],
      }),
    ).rejects.toThrow("not found");
    expect(prisma.oauthConsent.update).not.toHaveBeenCalled();
  });

  it("rejects a concurrent grant change inside the transaction instead of partially revoking offline access", async () => {
    const mismatch = new Prisma.PrismaClientKnownRequestError(
      "Record to update not found",
      {
        code: "P2025",
        clientVersion: "7",
      },
    );
    prisma.$transaction.mockRejectedValue(mismatch);
    await expect(
      reduceMcpConnectionScopes({
        userId: "user-1",
        clientId: "client-1",
        scopes: ["mcp:read", "mcp:write"],
      }),
    ).rejects.toThrow("Refresh");
    expect(prisma.oauthConsent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "grant-1",
          userId: "user-1",
          clientId: "client-1",
          scopes: { equals: ["mcp:read", "mcp:write", "mcp:send"] },
        },
      }),
    );
    // Both lazy Prisma operations belong to the same failed transaction.
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        prisma.oauthConsent.update.mock.results[0].value,
        prisma.oauthRefreshToken.deleteMany.mock.results[0].value,
      ]),
    );
  });

  it("propagates database failures instead of presenting them as a stale grant", async () => {
    const failure = new Error("Database unavailable");
    prisma.$transaction.mockRejectedValue(failure);
    await expect(
      reduceMcpConnectionScopes({
        userId: "user-1",
        clientId: "client-1",
        scopes: ["mcp:read"],
      }),
    ).rejects.toBe(failure);
  });
});
