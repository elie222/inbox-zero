import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { revokeMcpConnection } from "./connections";

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
