import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeAuthorization,
  refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import prisma from "@/utils/__mocks__/prisma";
import { getAuthToken, handleOAuthCallback } from "./oauth";

vi.mock("@/utils/prisma");
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  exchangeAuthorization: vi.fn(),
  refreshAuthorization: vi.fn(),
}));

describe("OAuth grant replacement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.mcpIntegration.findUnique.mockResolvedValue({
      id: "integration-1",
      oauthClientId: "client-id",
      registeredServerUrl: "https://mcp.notion.com",
      registeredAuthorizationUrl: "https://mcp.notion.com/authorize",
      registeredTokenUrl: "https://mcp.notion.com/token",
    } as never);
    prisma.mcpIntegration.upsert.mockResolvedValue({
      id: "integration-1",
    } as never);
    let connection: Record<string, unknown> = {
      id: "connection-1",
      emailAccountId: "mailbox-1",
      accessToken: "old-account-access",
      refreshToken: "old-account-refresh",
      expiresAt: new Date(0),
      isActive: true,
    };
    prisma.mcpConnection.findFirst.mockImplementation(
      async () => connection as never,
    );
    prisma.mcpConnection.upsert.mockImplementation(async ({ update }) => {
      for (const [key, value] of Object.entries(update)) {
        if (value !== undefined) connection[key] = value;
      }
      return connection as never;
    });
    prisma.mcpConnection.update.mockImplementation(async ({ data }) => {
      connection = { ...connection, ...data };
      return connection as never;
    });
    vi.mocked(refreshAuthorization).mockResolvedValue({
      access_token: "refreshed-old-account-access",
      token_type: "Bearer",
      expires_in: 3600,
    });
  });

  it("does not refresh a new authorization using the previous external account's grant", async () => {
    vi.mocked(exchangeAuthorization).mockResolvedValue({
      access_token: "new-account-access",
      token_type: "Bearer",
      expires_in: 1,
    });
    await handleOAuthCallback({
      integration: "notion",
      emailAccountId: "mailbox-1",
      code: "new-account-code",
      codeVerifier: "verifier",
      redirectUri: "https://example.com/oauth/callback",
    });

    await expect(
      getAuthToken({ integration: "notion", emailAccountId: "mailbox-1" }),
    ).rejects.toThrow("no refresh token is available");
    expect(refreshAuthorization).not.toHaveBeenCalled();
  });

  it("preserves an omitted refresh token when refreshing the same grant", async () => {
    await expect(
      getAuthToken({ integration: "notion", emailAccountId: "mailbox-1" }),
    ).resolves.toBe("refreshed-old-account-access");
    expect(prisma.mcpConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refreshToken: "old-account-refresh" }),
      }),
    );
  });
});
