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
      mockApiKeyLookup(null);

      await expect(
        validateApiKey(getRequest("invalid-api-key")),
      ).rejects.toThrow("Invalid API key");
    });

    it("rejects inactive keys", async () => {
      mockApiKeyLookup(null);

      await expect(
        validateApiKey(getRequest("inactive-api-key")),
      ).rejects.toThrow("Invalid API key");
      expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hashedKey: "hashed-key", isActive: true },
        }),
      );
    });

    it("rejects expired keys", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({ expiresAt: new Date("2020-01-01T00:00:00Z") }),
      );

      await expect(
        validateApiKey(getRequest("expired-api-key")),
      ).rejects.toThrow("Invalid API key");
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("returns the scoped api key and records last use", async () => {
      mockApiKeyLookup(buildApiKeyRecord());

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
      mockApiKeyLookup(null);

      await expect(getUserFromApiKey("invalid-key")).resolves.toBeNull();
    });

    it("returns the scoped user shape for valid keys", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          scopes: ["RULES_READ", "RULES_WRITE"],
        }),
      );

      await expect(getUserFromApiKey("valid-key")).resolves.toEqual({
        id: "user-id",
        emailAccountId: "email-account-id",
        scopes: ["RULES_READ", "RULES_WRITE"],
      });
    });

    it("returns null when the scoped inbox relation is missing", async () => {
      mockApiKeyLookup(buildApiKeyRecord({ emailAccount: null }));

      await expect(getUserFromApiKey("orphaned-key")).resolves.toBeNull();
    });

    it("returns null for keys without an inbox scope", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          emailAccountId: null,
          emailAccount: null,
        }),
      );

      await expect(getUserFromApiKey("legacy-key")).resolves.toBeNull();
    });
  });

  describe("validateAccountApiKey", () => {
    it("rejects keys without the required scopes", async () => {
      mockApiKeyLookup(buildApiKeyRecord());

      await expect(
        validateAccountApiKey(getRequest("valid-key"), ["RULES_WRITE"]),
      ).rejects.toThrow("API key does not have required permissions");
    });

    it("returns an account-scoped principal", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          scopes: ["RULES_READ", "RULES_WRITE"],
        }),
      );

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

    it("rejects a key whose user no longer owns the email account", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          emailAccount: buildEmailAccountRecord({
            userId: "new-owner-id",
          }),
        }),
      );

      await expect(
        validateAccountApiKey(getRequest("stale-key"), ["RULES_READ"]),
      ).rejects.toThrow("Invalid API key");
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("rejects a key whose user no longer owns the provider account", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          emailAccount: buildEmailAccountRecord({
            accountUserId: "new-owner-id",
          }),
        }),
      );

      await expect(
        validateAccountApiKey(getRequest("stale-key"), ["RULES_READ"]),
      ).rejects.toThrow("Invalid API key");
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("rejects keys without an account scope", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          emailAccountId: null,
          emailAccount: null,
        }),
      );

      await expect(
        validateAccountApiKey(getRequest("legacy-key"), ["RULES_READ"]),
      ).rejects.toThrow("Account-scoped API key required");
    });
  });

  describe("validateApiKeyAndGetEmailProvider", () => {
    it("creates the provider for account-scoped keys", async () => {
      vi.mocked(createEmailProvider).mockResolvedValue("provider" as never);
      mockApiKeyLookup(
        buildApiKeyRecord({
          scopes: ["STATS_READ"],
        }),
      );

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

    it("rejects keys without an inbox scope", async () => {
      mockApiKeyLookup(
        buildApiKeyRecord({
          emailAccountId: null,
          scopes: ["STATS_READ"],
          emailAccount: null,
        }),
      );

      await expect(
        validateApiKeyAndGetEmailProvider(getRequest("legacy-key") as any),
      ).rejects.toThrow("Account-scoped API key required");
    });
  });
});

function getRequest(apiKey: string | null) {
  return {
    headers: {
      get: vi.fn().mockReturnValue(apiKey),
    },
    logger: {},
  } as unknown as NextRequest;
}

function mockApiKeyLookup(record: ReturnType<typeof buildApiKeyRecord> | null) {
  vi.mocked(hashApiKey).mockReturnValue("hashed-key");
  prisma.apiKey.findUnique.mockResolvedValue(record as never);
}

function buildApiKeyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-id",
    userId: "user-id",
    emailAccountId: "email-account-id",
    expiresAt: null,
    scopes: ["RULES_READ"],
    emailAccount: buildEmailAccountRecord(),
    ...overrides,
  };
}

function buildEmailAccountRecord({
  userId = "user-id",
  accountUserId = "user-id",
}: {
  userId?: string;
  accountUserId?: string;
} = {}) {
  return {
    id: "email-account-id",
    userId,
    email: "user@example.com",
    account: {
      id: "account-id",
      userId: accountUserId,
      provider: "google",
    },
  };
}
