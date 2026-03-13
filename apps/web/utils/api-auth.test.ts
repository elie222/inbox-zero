import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import prisma from "@/utils/__mocks__/prisma";
import {
  getUserFromApiKey,
  validateAccountApiKey,
  validateApiKey,
  validateApiKeyAndGetEmailProvider,
} from "./api-auth";
import { hashApiKey } from "@/utils/api-key";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

vi.mock("@/utils/prisma");
vi.mock("@/utils/api-key");
vi.mock("@/utils/email/provider");
vi.mock("server-only", () => ({}));

function getRequest(apiKey: string | null) {
  return {
    headers: {
      get: vi.fn().mockReturnValue(apiKey),
    },
    logger: {},
  } as unknown as NextRequest;
}

describe("api-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.apiKey.update.mockResolvedValue({} as never);
  });

  describe("validateApiKey", () => {
    it("throws when the key is missing", async () => {
      await expect(validateApiKey(getRequest(null))).rejects.toThrow(SafeError);
      await expect(validateApiKey(getRequest(null))).rejects.toThrow(
        "Missing API key",
      );
    });

    it("throws when the key is invalid", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(
        validateApiKey(getRequest("invalid-api-key")),
      ).rejects.toThrow("Invalid API key");
    });

    it("returns the scoped api key and records last use", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue({
        id: "key-id",
        userId: "user-id",
        emailAccountId: "email-account-id",
        expiresAt: null,
        scopes: ["RULES_READ"],
        emailAccount: {
          id: "email-account-id",
          email: "user@example.com",
          account: {
            id: "account-id",
            provider: "google",
          },
        },
        user: {
          accounts: [],
        },
      } as never);

      const result = await validateApiKey(getRequest("valid-api-key"));

      expect(result).toEqual({
        apiKey: expect.objectContaining({
          id: "key-id",
          userId: "user-id",
          emailAccountId: "email-account-id",
          scopes: ["RULES_READ"],
        }),
      });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key-id" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  describe("getUserFromApiKey", () => {
    it("returns null for invalid keys", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(getUserFromApiKey("invalid-key")).resolves.toBeNull();
    });

    it("returns the scoped user shape for valid keys", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue({
        id: "key-id",
        userId: "user-id",
        emailAccountId: "email-account-id",
        expiresAt: null,
        scopes: ["RULES_READ", "RULES_WRITE"],
        emailAccount: null,
        user: {
          accounts: [],
        },
      } as never);

      await expect(getUserFromApiKey("valid-key")).resolves.toEqual({
        id: "user-id",
        emailAccountId: "email-account-id",
        scopes: ["RULES_READ", "RULES_WRITE"],
      });
    });
  });

  describe("validateAccountApiKey", () => {
    it("rejects keys without the required scopes", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue({
        id: "key-id",
        userId: "user-id",
        emailAccountId: "email-account-id",
        expiresAt: null,
        scopes: ["RULES_READ"],
        emailAccount: {
          id: "email-account-id",
          email: "user@example.com",
          account: {
            id: "account-id",
            provider: "google",
          },
        },
        user: {
          accounts: [],
        },
      } as never);

      await expect(
        validateAccountApiKey(getRequest("valid-key"), ["RULES_WRITE"]),
      ).rejects.toThrow("API key does not have required permissions");
    });

    it("returns an account-scoped principal", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue({
        id: "key-id",
        userId: "user-id",
        emailAccountId: "email-account-id",
        expiresAt: null,
        scopes: ["RULES_READ", "RULES_WRITE"],
        emailAccount: {
          id: "email-account-id",
          email: "user@example.com",
          account: {
            id: "account-id",
            provider: "google",
          },
        },
        user: {
          accounts: [],
        },
      } as never);

      await expect(
        validateAccountApiKey(getRequest("valid-key"), ["RULES_WRITE"]),
      ).resolves.toEqual({
        apiKeyId: "key-id",
        userId: "user-id",
        emailAccountId: "email-account-id",
        email: "user@example.com",
        provider: "google",
        accountId: "account-id",
        scopes: ["RULES_READ", "RULES_WRITE"],
      });
    });
  });

  describe("validateApiKeyAndGetEmailProvider", () => {
    it("creates the provider for account-scoped keys", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      vi.mocked(createEmailProvider).mockResolvedValue("provider" as never);
      prisma.apiKey.findUnique.mockResolvedValue({
        id: "key-id",
        userId: "user-id",
        emailAccountId: "email-account-id",
        expiresAt: null,
        scopes: ["STATS_READ"],
        emailAccount: {
          id: "email-account-id",
          email: "user@example.com",
          account: {
            id: "account-id",
            provider: "google",
          },
        },
        user: {
          accounts: [],
        },
      } as never);

      await expect(
        validateApiKeyAndGetEmailProvider(getRequest("valid-key") as any),
      ).resolves.toEqual({
        apiKeyId: "key-id",
        emailProvider: "provider",
        userId: "user-id",
        accountId: "account-id",
        emailAccountId: "email-account-id",
        provider: "google",
        scopes: ["STATS_READ"],
        authType: "account-scoped",
      });
    });

    it("falls back to the legacy first linked account", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      vi.mocked(createEmailProvider).mockResolvedValue("provider" as never);
      prisma.apiKey.findUnique.mockResolvedValue({
        id: "key-id",
        userId: "user-id",
        emailAccountId: null,
        expiresAt: null,
        scopes: [],
        emailAccount: null,
        user: {
          accounts: [
            {
              id: "legacy-account-id",
              provider: "google",
              emailAccount: {
                id: "legacy-email-account-id",
              },
            },
          ],
        },
      } as never);

      await expect(
        validateApiKeyAndGetEmailProvider(getRequest("legacy-key") as any),
      ).resolves.toEqual({
        apiKeyId: "key-id",
        emailProvider: "provider",
        userId: "user-id",
        accountId: "legacy-account-id",
        emailAccountId: "legacy-email-account-id",
        provider: "google",
        scopes: [],
        authType: "legacy",
      });
    });
  });
});
