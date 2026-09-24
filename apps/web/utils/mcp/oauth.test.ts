import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import prisma from "@/utils/__mocks__/prisma";
import { MCP_INTEGRATIONS } from "./integrations";
import { generateOAuthUrl, handleOAuthCallback } from "./oauth";

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
    expect(discoverAuthorizationServerMetadata).toHaveBeenCalledTimes(2);
  });

  it("retries registration when saving registered credentials fails", async () => {
    const persistIntegration =
      prisma.mcpIntegration.upsert.getMockImplementation();
    if (!persistIntegration)
      throw new Error("Integration persistence mock missing");
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
    expect(discoverAuthorizationServerMetadata).toHaveBeenCalledTimes(2);
  });

  it("reuses discovery and credentials after successful registration", async () => {
    await startOAuth();
    await startOAuth();
    expect(registerClient).toHaveBeenCalledTimes(1);
    expect(discoverAuthorizationServerMetadata).toHaveBeenCalledTimes(1);
  });

  // Servers such as Attio reject `scope: ""` with invalid_scope rather than
  // applying their default scopes
  it("omits scope during registration when the integration declares none", async () => {
    await generateOAuthUrl({
      integration: builtIn("stripe"),
      redirectUri: "https://example.com/oauth/callback",
      state: "oauth-state",
    });

    const [, { clientMetadata }] = vi.mocked(registerClient).mock.calls[0];
    expect(clientMetadata).not.toHaveProperty("scope");
  });

  it("registers with the integration's scopes when declared", async () => {
    await generateOAuthUrl({
      integration: builtIn("attio"),
      redirectUri: "https://example.com/oauth/callback",
      state: "oauth-state",
    });

    const [, { clientMetadata }] = vi.mocked(registerClient).mock.calls[0];
    expect(clientMetadata.scope).toBe("openid offline_access mcp");
  });
});

function startOAuth() {
  return generateOAuthUrl({
    integration: builtIn("notion"),
    redirectUri: "https://example.com/oauth/callback",
    state: "oauth-state",
  });
}

function builtIn(name: keyof typeof MCP_INTEGRATIONS) {
  return { ...MCP_INTEGRATIONS[name], isCustom: false };
}

describe("handleOAuthCallback for custom servers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.mcpIntegration.findUnique.mockResolvedValue({
      id: "integration-custom",
      name: "custom_abc",
      oauthClientId: "registered-client",
      oauthClientSecret: null,
      registeredAuthorizationUrl: "https://kb.example.com/authorize",
      registeredTokenUrl: "https://kb.example.com/token",
      registeredServerUrl: "https://kb.example.com",
    } as never);
    vi.mocked(exchangeAuthorization).mockResolvedValue({
      access_token: "access",
      token_type: "bearer",
      expires_in: 3600,
    });
  });

  it("does not recreate a custom server that was removed mid-flow", async () => {
    prisma.mcpIntegration.findFirst.mockResolvedValue(null);

    await expect(
      handleOAuthCallback({
        integration: {
          name: "custom_abc",
          displayName: "Knowledge base",
          serverUrl: "https://kb.example.com/mcp",
          authType: "oauth",
          scopes: [],
          isCustom: true,
        },
        code: "code",
        codeVerifier: "verifier",
        redirectUri: "https://app.example.com/api/mcp/custom_abc/callback",
        emailAccountId: "account-1",
      }),
    ).rejects.toThrow("removed before the connection completed");

    expect(prisma.mcpIntegration.upsert).not.toHaveBeenCalled();
    expect(prisma.mcpConnection.upsert).not.toHaveBeenCalled();
  });
});
