import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateWebhookAccount } from "./validate-webhook-account";
import type { ValidatedWebhookAccountData } from "./validate-webhook-account";
import { PremiumTier } from "@prisma/client";

// Mock dependencies
vi.mock("@/utils/premium");
vi.mock("@/app/api/watch/controller");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/prisma");
vi.mock("server-only", () => ({}));

// Import mocked functions
import { isPremium, hasAiAccess } from "@/utils/premium";
import { unwatchEmails } from "@/app/api/watch/controller";
import { createEmailProvider } from "@/utils/email/provider";

describe("validateWebhookAccount", () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
  };

  const mockEmailProvider = { type: "google" as const };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createEmailProvider).mockResolvedValue(mockEmailProvider as any);
  });

  function createMockEmailAccount(
    overrides: Partial<ValidatedWebhookAccountData> = {},
  ): ValidatedWebhookAccountData {
    return {
      id: "account-id",
      email: "user@test.com",
      userId: "user-id",
      about: "Test account",
      lastSyncedHistoryId: null,
      autoCategorizeSenders: false,
      watchEmailsSubscriptionId: "subscription-id",
      account: {
        provider: "google",
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: new Date(),
      },
      rules: [
        {
          id: "rule-id",
          name: "Test Rule",
          instructions: "Test instructions",
          actions: [],
          categoryFilters: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          enabled: true,
          runOnThreads: false,
          groupId: null,
          from: null,
          to: null,
          subject: null,
          body: null,
          categoryFilterType: null,
          conditionalOperator: "AND",
          automate: true,
          emailAccountId: "account-id",
          systemType: null,
          promptText: null,
        },
      ],
      user: {
        aiProvider: null,
        aiModel: null,
        aiApiKey: null,
        premium: {
          lemonSqueezyRenewsAt: new Date(Date.now() + 86_400_000), // Tomorrow
          stripeSubscriptionStatus: "active",
          tier: PremiumTier.PRO_MONTHLY,
        },
      },
      ...overrides,
    };
  }

  describe("when emailAccount is null", () => {
    it("should return failure with error logged", async () => {
      const result = await validateWebhookAccount(null, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith("Account not found");
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when account is not premium", () => {
    it("should unwatch emails and return failure", async () => {
      const emailAccount = createMockEmailAccount({
        user: {
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
          premium: null,
        },
      });

      vi.mocked(isPremium).mockReturnValue(false);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Account not premium",
        expect.objectContaining({
          email: "user@test.com",
          emailAccountId: "account-id",
        }),
      );
      expect(createEmailProvider).toHaveBeenCalledWith({
        emailAccountId: "account-id",
        provider: "google",
      });
      expect(unwatchEmails).toHaveBeenCalledWith({
        emailAccountId: "account-id",
        provider: mockEmailProvider,
        subscriptionId: "subscription-id",
      });
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when user does not have AI access", () => {
    it("should unwatch emails and return failure", async () => {
      const emailAccount = createMockEmailAccount();

      vi.mocked(isPremium).mockReturnValue(true);
      vi.mocked(hasAiAccess).mockReturnValue(false);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.trace).toHaveBeenCalledWith(
        "Does not have ai access",
        expect.objectContaining({
          email: "user@test.com",
          emailAccountId: "account-id",
        }),
      );
      expect(unwatchEmails).toHaveBeenCalledWith({
        emailAccountId: "account-id",
        provider: mockEmailProvider,
        subscriptionId: "subscription-id",
      });
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when account has no automation rules", () => {
    it("should return failure", async () => {
      const emailAccount = createMockEmailAccount({
        rules: [],
      });

      vi.mocked(isPremium).mockReturnValue(true);
      vi.mocked(hasAiAccess).mockReturnValue(true);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.trace).toHaveBeenCalledWith("Has no rules enabled", {
        email: "user@test.com",
      });
      expect(unwatchEmails).not.toHaveBeenCalled();
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when access_token is missing", () => {
    it("should return failure with error logged", async () => {
      const emailAccount = createMockEmailAccount({
        account: {
          provider: "google",
          access_token: null,
          refresh_token: "refresh-token",
          expires_at: new Date(),
        },
      });

      vi.mocked(isPremium).mockReturnValue(true);
      vi.mocked(hasAiAccess).mockReturnValue(true);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Missing access or refresh token",
        {
          email: "user@test.com",
        },
      );
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when refresh_token is missing", () => {
    it("should return failure with error logged", async () => {
      const emailAccount = createMockEmailAccount({
        account: {
          provider: "google",
          access_token: "access-token",
          refresh_token: null,
          expires_at: new Date(),
        },
      });

      vi.mocked(isPremium).mockReturnValue(true);
      vi.mocked(hasAiAccess).mockReturnValue(true);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Missing access or refresh token",
        {
          email: "user@test.com",
        },
      );
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when account is null", () => {
    it("should return failure with error logged", async () => {
      const emailAccount = {
        ...createMockEmailAccount(),
        account: null,
      } as any as ValidatedWebhookAccountData;

      vi.mocked(isPremium).mockReturnValue(true);
      vi.mocked(hasAiAccess).mockReturnValue(true);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Missing access or refresh token",
        {
          email: "user@test.com",
        },
      );
      if (!result.success) {
        expect(await result.response.json()).toEqual({ ok: true });
      }
    });
  });

  describe("when all validation passes", () => {
    it("should return success with validated data", async () => {
      const emailAccount = createMockEmailAccount();

      vi.mocked(isPremium).mockReturnValue(true);
      vi.mocked(hasAiAccess).mockReturnValue(true);

      const result = await validateWebhookAccount(emailAccount, mockLogger);

      expect(result.success).toBe(true);
      expect(unwatchEmails).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();

      if (result.success) {
        expect(result.data).toEqual({
          emailAccount,
          hasAutomationRules: true,
          hasAiAccess: true,
        });
      }
    });
  });
});
