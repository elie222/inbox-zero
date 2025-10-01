import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getBearerToken, createMcpHeaders } from "./helpers";
import type {
  McpIntegrationConfig,
  CredentialStorage,
  ConnectionCredentials,
} from "./types";

const mockIntegration: McpIntegrationConfig = {
  name: "test",
  displayName: "Test Integration",
  serverUrl: "https://mcp.test.com",
  authType: "oauth",
  scopes: ["read"],
  oauthConfig: {
    authorization_endpoint: "https://auth.test.com/authorize",
    token_endpoint: "https://auth.test.com/token",
  },
};

const createMockStorage = (): CredentialStorage => ({
  getClientCredentials: vi.fn(),
  storeClientCredentials: vi.fn(),
  getConnectionCredentials: vi.fn(),
  storeConnectionCredentials: vi.fn(),
  updateConnectionCredentials: vi.fn(),
});

describe("Helper Utilities", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("getBearerToken", () => {
    it("should return valid API key token", async () => {
      const apiKeyIntegration: McpIntegrationConfig = {
        ...mockIntegration,
        authType: "api-token",
      };

      const storage = createMockStorage();
      const credentials: ConnectionCredentials = {
        apiKey: "test-api-key",
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        credentials,
      );

      const token = await getBearerToken(apiKeyIntegration, "user123", storage);

      expect(token).toBe("test-api-key");
    });

    it("should return valid OAuth access token", async () => {
      const storage = createMockStorage();
      const credentials: ConnectionCredentials = {
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000), // 1 hour from now
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        credentials,
      );

      const token = await getBearerToken(mockIntegration, "user123", storage);

      expect(token).toBe("valid-token");
    });

    it("should refresh expired OAuth token", async () => {
      const storage = createMockStorage();
      const expiredCreds: ConnectionCredentials = {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() - 1000), // Expired
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        expiredCreds,
      );
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "client-id",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-token",
          refresh_token: "new-refresh",
          expires_in: 3600,
        }),
      });

      const token = await getBearerToken(
        mockIntegration,
        "user123",
        storage,
        undefined,
        { autoRefresh: true },
      );

      expect(token).toBe("new-token");
      expect(storage.updateConnectionCredentials).toHaveBeenCalledWith(
        "test",
        "user123",
        expect.objectContaining({
          accessToken: "new-token",
          refreshToken: "new-refresh",
        }),
      );
    });

    it("should handle refresh without expires_in", async () => {
      const storage = createMockStorage();
      const expiredCreds: ConnectionCredentials = {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() - 1000),
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        expiredCreds,
      );
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "client-id",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-token",
          // No expires_in
        }),
      });

      const token = await getBearerToken(
        mockIntegration,
        "user123",
        storage,
        undefined,
        { autoRefresh: true },
      );

      expect(token).toBe("new-token");
      expect(storage.updateConnectionCredentials).toHaveBeenCalledWith(
        "test",
        "user123",
        expect.objectContaining({
          expiresAt: expiredCreds.expiresAt, // Should use original expiresAt
        }),
      );
    });

    it("should throw if expired and no refresh token", async () => {
      const storage = createMockStorage();
      const expiredCreds: ConnectionCredentials = {
        accessToken: "old-token",
        expiresAt: new Date(Date.now() - 1000), // Expired
        // No refresh token
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        expiredCreds,
      );

      await expect(
        getBearerToken(mockIntegration, "user123", storage),
      ).rejects.toThrow("OAuth token has expired");
    });

    it("should throw if no credentials found", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(null);

      await expect(
        getBearerToken(mockIntegration, "user123", storage),
      ).rejects.toThrow("No credentials found");
    });

    it("should throw if API key missing", async () => {
      const apiKeyIntegration: McpIntegrationConfig = {
        ...mockIntegration,
        authType: "api-token",
      };

      const storage = createMockStorage();
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue({
        // No API key
      });

      await expect(
        getBearerToken(apiKeyIntegration, "user123", storage),
      ).rejects.toThrow("No API key found");
    });

    it("should throw if access token missing", async () => {
      const storage = createMockStorage();
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue({
        // No access token
      });

      await expect(
        getBearerToken(mockIntegration, "user123", storage),
      ).rejects.toThrow("No access token found");
    });

    it("should throw for unsupported auth type", async () => {
      const unsupportedIntegration: McpIntegrationConfig = {
        ...mockIntegration,
        authType: "basic" as any,
      };

      const storage = createMockStorage();
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue({
        accessToken: "token",
      });

      await expect(
        getBearerToken(unsupportedIntegration, "user123", storage),
      ).rejects.toThrow("Unsupported auth type");
    });
  });

  describe("createMcpHeaders", () => {
    it("should create headers with bearer token", async () => {
      const storage = createMockStorage();
      const credentials: ConnectionCredentials = {
        accessToken: "test-token",
        expiresAt: new Date(Date.now() + 3_600_000),
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        credentials,
      );

      const headers = await createMcpHeaders(
        mockIntegration,
        "user123",
        storage,
      );

      expect(headers.Authorization).toBe("Bearer test-token");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("should create headers with refreshed token", async () => {
      const storage = createMockStorage();
      const expiredCreds: ConnectionCredentials = {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() - 1000), // Expired
      };
      vi.mocked(storage.getConnectionCredentials).mockResolvedValue(
        expiredCreds,
      );
      vi.mocked(storage.getClientCredentials).mockResolvedValue({
        clientId: "client-id",
        isDynamic: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "refreshed-token",
          expires_in: 3600,
        }),
      });

      const headers = await createMcpHeaders(
        mockIntegration,
        "user123",
        storage,
        undefined,
        { autoRefresh: true },
      );

      expect(headers.Authorization).toBe("Bearer refreshed-token");
    });
  });
});
