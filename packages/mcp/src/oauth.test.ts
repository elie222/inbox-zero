import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  performDynamicClientRegistration,
  getOrCreateClientCredentials,
  generateAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from "./oauth";
import type {
  McpIntegrationConfig,
  CredentialStorage,
  ClientCredentials,
} from "./types";

const mockIntegration: McpIntegrationConfig = {
  name: "test",
  displayName: "Test Integration",
  serverUrl: "https://mcp.test.com",
  authType: "oauth",
  defaultScopes: ["read", "write"],
  oauthConfig: {
    authorization_endpoint: "https://auth.test.com/authorize",
    token_endpoint: "https://auth.test.com/token",
    registration_endpoint: "https://auth.test.com/register",
  },
};

const createMockStorage = (): CredentialStorage => ({
  getClientCredentials: vi.fn(),
  storeClientCredentials: vi.fn(),
  getConnectionCredentials: vi.fn(),
  storeConnectionCredentials: vi.fn(),
  updateConnectionCredentials: vi.fn(),
});

describe("OAuth Utilities", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("performDynamicClientRegistration", () => {
    it("should register a new OAuth client", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          client_id: "test-client-id",
          client_secret: "test-client-secret",
        }),
      });

      const result = await performDynamicClientRegistration(
        mockIntegration,
        "https://app.com/callback",
      );

      expect(result.clientId).toBe("test-client-id");
      expect(result.clientSecret).toBe("test-client-secret");
      expect(result.isDynamic).toBe(true);
    });

    it("should throw if registration endpoint not configured", async () => {
      const noRegIntegration = {
        ...mockIntegration,
        oauthConfig: {
          authorization_endpoint: "https://auth.test.com/authorize",
          token_endpoint: "https://auth.test.com/token",
        },
      };

      await expect(
        performDynamicClientRegistration(
          noRegIntegration,
          "https://app.com/callback",
        ),
      ).rejects.toThrow("Dynamic client registration not supported");
    });

    it("should throw on registration failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      await expect(
        performDynamicClientRegistration(
          mockIntegration,
          "https://app.com/callback",
        ),
      ).rejects.toThrow("Dynamic client registration failed");
    });
  });

  describe("getOrCreateClientCredentials", () => {
    it("should return static credentials if provided", async () => {
      const storage = createMockStorage();

      const result = await getOrCreateClientCredentials(
        mockIntegration,
        "https://app.com/callback",
        storage,
        undefined,
        { clientId: "static-id", clientSecret: "static-secret" },
      );

      expect(result.clientId).toBe("static-id");
      expect(result.isDynamic).toBe(false);
      expect(storage.getClientCredentials).not.toHaveBeenCalled();
    });

    it("should return stored credentials if available", async () => {
      const storage = createMockStorage();
      const storedCreds: ClientCredentials = {
        clientId: "stored-id",
        clientSecret: "stored-secret",
        isDynamic: true,
      };
      vi.mocked(storage.getClientCredentials).mockResolvedValue(storedCreds);

      const result = await getOrCreateClientCredentials(
        mockIntegration,
        "https://app.com/callback",
        storage,
      );

      expect(result).toEqual(storedCreds);
      expect(storage.getClientCredentials).toHaveBeenCalledWith("test");
    });

    it("should perform dynamic registration if no credentials exist", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue(null);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          client_id: "dynamic-id",
          client_secret: "dynamic-secret",
        }),
      });

      const result = await getOrCreateClientCredentials(
        mockIntegration,
        "https://app.com/callback",
        storage,
      );

      expect(result.clientId).toBe("dynamic-id");
      expect(result.isDynamic).toBe(true);
      expect(storage.storeClientCredentials).toHaveBeenCalled();
    });
  });

  describe("generateAuthorizationUrl", () => {
    it("should generate valid OAuth URL with PKCE", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        isDynamic: true,
      });

      const { url, codeVerifier } = await generateAuthorizationUrl(
        mockIntegration,
        "https://app.com/callback",
        "state123",
        storage,
      );

      expect(url).toContain("https://auth.test.com/authorize");
      expect(url).toContain("response_type=code");
      expect(url).toContain("client_id=test-client");
      expect(url).toContain("redirect_uri=https%3A%2F%2Fapp.com%2Fcallback");
      expect(url).toContain("scope=read+write");
      expect(url).toContain("code_challenge=");
      expect(url).toContain("code_challenge_method=S256");
      expect(url).toContain("state=state123");
      expect(url).toContain("resource=https%3A%2F%2Fmcp.test.com");
      expect(codeVerifier).toBeTruthy();
    });

    it("should throw if OAuth not configured", async () => {
      const noOAuthIntegration = {
        ...mockIntegration,
        oauthConfig: undefined,
      };
      const storage = createMockStorage();

      await expect(
        generateAuthorizationUrl(
          noOAuthIntegration,
          "https://app.com/callback",
          "state123",
          storage,
        ),
      ).rejects.toThrow("OAuth not configured");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should exchange code for tokens", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "access123",
          refresh_token: "refresh123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      });

      const tokens = await exchangeCodeForTokens(
        mockIntegration,
        "auth-code",
        "code-verifier",
        "https://app.com/callback",
        storage,
      );

      expect(tokens.access_token).toBe("access123");
      expect(tokens.refresh_token).toBe("refresh123");
      expect(tokens.expires_in).toBe(3600);
    });

    it("should include PKCE verifier in token request", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        isDynamic: true,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "token" }),
      });
      global.fetch = mockFetch;

      await exchangeCodeForTokens(
        mockIntegration,
        "auth-code",
        "code-verifier-123",
        "https://app.com/callback",
        storage,
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = callArgs[1]?.body?.toString() || "";
      expect(body).toContain("code_verifier=code-verifier-123");
    });

    it("should include client secret for confidential clients", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        clientSecret: "test-secret",
        isDynamic: false,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "token" }),
      });
      global.fetch = mockFetch;

      await exchangeCodeForTokens(
        mockIntegration,
        "auth-code",
        "verifier",
        "https://app.com/callback",
        storage,
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = callArgs[1]?.body?.toString() || "";
      expect(body).toContain("client_secret=test-secret");
    });

    it("should throw on token exchange failure", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "invalid_grant",
          error_description: "Code expired",
        }),
      });

      await expect(
        exchangeCodeForTokens(
          mockIntegration,
          "invalid-code",
          "verifier",
          "https://app.com/callback",
          storage,
        ),
      ).rejects.toThrow("Token exchange failed");
    });

    it("should throw if OAuth not configured", async () => {
      const noOAuthIntegration = {
        ...mockIntegration,
        oauthConfig: undefined,
      };
      const storage = createMockStorage();

      await expect(
        exchangeCodeForTokens(
          noOAuthIntegration,
          "code",
          "verifier",
          "https://app.com/callback",
          storage,
        ),
      ).rejects.toThrow("OAuth not configured");
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh an access token", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        }),
      });

      const tokens = await refreshAccessToken(
        mockIntegration,
        "old-refresh-token",
        storage,
      );

      expect(tokens.access_token).toBe("new-access-token");
      expect(tokens.refresh_token).toBe("new-refresh-token");
    });

    it("should use static credentials if provided", async () => {
      const storage = createMockStorage();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "token" }),
      });
      global.fetch = mockFetch;

      await refreshAccessToken(
        mockIntegration,
        "refresh-token",
        storage,
        undefined,
        { clientId: "static-id", clientSecret: "static-secret" },
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = callArgs[1]?.body?.toString() || "";
      expect(body).toContain("client_id=static-id");
      expect(body).toContain("client_secret=static-secret");
    });

    it("should throw on refresh failure", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "test-client",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "invalid_grant",
          error_description: "Refresh token expired",
        }),
      });

      await expect(
        refreshAccessToken(mockIntegration, "expired-token", storage),
      ).rejects.toThrow("Token refresh failed");
    });

    it("should throw if no client credentials available", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getClientCredentials).mockResolvedValue(null);

      await expect(
        refreshAccessToken(mockIntegration, "refresh-token", storage),
      ).rejects.toThrow("No client credentials available");
    });

    it("should throw if OAuth not configured", async () => {
      const noOAuthIntegration = {
        ...mockIntegration,
        oauthConfig: undefined,
      };
      const storage = createMockStorage();

      await expect(
        refreshAccessToken(noOAuthIntegration, "refresh-token", storage),
      ).rejects.toThrow("OAuth not configured");
    });
  });
});
