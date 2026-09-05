import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import prisma from "@/utils/__mocks__/prisma";
import { generateOAuthUrl } from "./oauth";

vi.mock("@/utils/prisma");
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  discoverAuthorizationServerMetadata: vi.fn(),
  discoverOAuthProtectedResourceMetadata: vi.fn(),
  registerClient: vi.fn(),
  startAuthorization: vi.fn(),
  exchangeAuthorization: vi.fn(),
  refreshAuthorization: vi.fn(),
}));

describe("OAuth registration recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    let integration: Record<string, unknown> = {
      id: "integration-1",
      name: "notion",
    };
    prisma.mcpIntegration.findUnique.mockImplementation(
      async () => integration as never,
    );
    prisma.mcpIntegration.upsert.mockImplementation(async ({ update }) => {
      integration = { ...integration, ...update };
      return integration as never;
    });
    vi.mocked(discoverOAuthProtectedResourceMetadata).mockResolvedValue(
      undefined,
    );
    vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({
      issuer: "https://mcp.notion.com",
      authorization_endpoint: "https://mcp.notion.com/authorize",
      token_endpoint: "https://mcp.notion.com/token",
      registration_endpoint: "https://mcp.notion.com/register",
      response_types_supported: ["code"],
    });
    vi.mocked(registerClient).mockResolvedValue({
      client_id: "registered-client",
    });
    vi.mocked(startAuthorization).mockResolvedValue({
      authorizationUrl: new URL(
        "https://mcp.notion.com/authorize?client_id=registered-client",
      ),
      codeVerifier: "verifier",
    });
  });

  it("retries registration after transient failure despite cached discovery", async () => {
    vi.mocked(registerClient).mockRejectedValueOnce(
      new Error("Registration temporarily unavailable"),
    );

    await expect(startOAuth()).rejects.toThrow(
      "Registration temporarily unavailable",
    );
    await expect(startOAuth()).resolves.toMatchObject({
      codeVerifier: "verifier",
    });
    expect(registerClient).toHaveBeenCalledTimes(2);
  });

  it("retries registration when saving registered credentials fails", async () => {
    const persistIntegration =
      prisma.mcpIntegration.upsert.getMockImplementation()!;
    prisma.mcpIntegration.upsert.mockImplementation(async (args) => {
      if (args.update.oauthClientId) {
        prisma.mcpIntegration.upsert.mockImplementation(persistIntegration);
        throw new Error("Credential storage temporarily unavailable");
      }
      return persistIntegration(args);
    });

    await expect(startOAuth()).rejects.toThrow(
      "Credential storage temporarily unavailable",
    );
    await expect(startOAuth()).resolves.toMatchObject({
      codeVerifier: "verifier",
    });
    expect(registerClient).toHaveBeenCalledTimes(2);
  });

  it("reuses discovery and credentials after successful registration", async () => {
    await startOAuth();
    await startOAuth();
    expect(registerClient).toHaveBeenCalledTimes(1);
    expect(discoverAuthorizationServerMetadata).toHaveBeenCalledTimes(1);
  });
});

function startOAuth() {
  return generateOAuthUrl({
    integration: "notion",
    redirectUri: "https://example.com/oauth/callback",
    state: "oauth-state",
  });
}
