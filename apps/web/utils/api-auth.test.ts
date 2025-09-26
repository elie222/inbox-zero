import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateApiKey,
  getUserFromApiKey,
  validateApiKeyAndGetEmailProvider,
} from "./api-auth";
import prisma from "@/utils/__mocks__/prisma";
import { hashApiKey } from "@/utils/api-key";
import * as gmailClient from "@/utils/gmail/client";
import { SafeError } from "@/utils/error";
import type { NextRequest } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";

// Mock dependencies
vi.mock("@/utils/prisma");
vi.mock("@/utils/api-key");
vi.mock("@/utils/gmail/client");
vi.mock("server-only", () => ({}));

// Create a type that matches what our test expects to be returned from prisma.apiKey.findUnique
type MockApiKeyResult = {
  user: {
    id: string;
    accounts: Array<any>;
  };
  isActive: boolean;
};

describe("api-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateApiKey", () => {
    it("should throw an error if API key is missing", async () => {
      // Create a mock request with no API key
      const request = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as unknown as NextRequest;

      await expect(validateApiKey(request)).rejects.toThrow(SafeError);
      await expect(validateApiKey(request)).rejects.toThrow("Missing API key");
    });

    it("should throw an error if API key is invalid", async () => {
      // Create a mock request with an API key
      const request = {
        headers: {
          get: vi.fn().mockReturnValue("test-api-key"),
        },
      } as unknown as NextRequest;

      // Mock getUserFromApiKey to return null (invalid API key)
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(validateApiKey(request)).rejects.toThrow(SafeError);
      await expect(validateApiKey(request)).rejects.toThrow("Invalid API key");
    });

    it("should return user if API key is valid", async () => {
      // Create a mock request with a valid API key
      const request = {
        headers: {
          get: vi.fn().mockReturnValue("valid-api-key"),
        },
      } as unknown as NextRequest;

      // Mock getUserFromApiKey to return a user
      const mockUser = {
        id: "user-id",
        accounts: [],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      const result = await validateApiKey(request);
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe("getUserFromApiKey", () => {
    it("should return null if API key is not found", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue(null);

      const result = await getUserFromApiKey("invalid-key");
      expect(result).toBeNull();
    });

    it("should return user if API key is valid", async () => {
      const mockUser = {
        id: "user-id",
        accounts: [],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      const result = await getUserFromApiKey("valid-key");
      expect(result).toEqual(mockUser);
    });
  });

  describe("validateApiKeyAndGetGmailClient", () => {
    it("should throw an error if API key is invalid", async () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as unknown as NextRequest;

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        SafeError,
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Missing API key",
      );
    });

    it("should throw an error if user has no Google account", async () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue("valid-api-key"),
        },
      } as unknown as NextRequest;

      const mockUser = {
        id: "user-id",
        accounts: [], // Empty accounts array
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        SafeError,
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Missing account",
      );
    });

    it("should throw an error if account is missing tokens", async () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue("valid-api-key"),
        },
      } as unknown as NextRequest;

      const mockUser = {
        id: "user-id",
        accounts: [
          {
            // Missing tokens
            providerAccountId: "google-account-id",
          },
        ],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        SafeError,
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Missing access token",
      );
    });

    it("should throw an error if Gmail client refresh fails", async () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue("valid-api-key"),
        },
      } as unknown as NextRequest;

      const mockUser = {
        id: "user-id",
        accounts: [
          {
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_at: new Date(),
            providerAccountId: "google-account-id",
          },
        ],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      // Mock getGmailClientWithRefresh to return null (refresh failed)
      vi.mocked(gmailClient.getGmailClientWithRefresh).mockRejectedValue(
        new Error("Error refreshing Gmail access token"),
      );

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        Error,
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Error refreshing Gmail access token",
      );
    });

    it("should return Gmail client and user ID if successful", async () => {
      const request = {
        headers: {
          get: vi.fn().mockReturnValue("valid-api-key"),
        },
      } as unknown as NextRequest;

      const mockUser = {
        id: "user-id",
        accounts: [
          {
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_at: new Date(1_234_567_890 * 1000),
            providerAccountId: "google-account-id",
          },
        ],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      // Mock successful Gmail client refresh
      const mockGmailClient = {
        users: {},
      } as unknown as gmail_v1.Gmail;
      vi.mocked(gmailClient.getGmailClientWithRefresh).mockResolvedValue(
        mockGmailClient,
      );

      const result = await validateApiKeyAndGetEmailProvider(request);
      expect(result).toEqual({
        accessToken: "access-token",
        gmail: mockGmailClient,
        userId: "user-id",
      });

      // Verify getGmailClientWithRefresh was called with correct parameters
      expect(gmailClient.getGmailClientWithRefresh).toHaveBeenCalledWith({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: 1_234_567_890 * 1000,
      });
    });
  });
});
