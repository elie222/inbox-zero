import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutlookSubscriptionManager } from "@/utils/outlook/subscription-manager";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";

// Mock dependencies
vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

describe("OutlookSubscriptionManager", () => {
  let mockProvider: EmailProvider;
  let manager: OutlookSubscriptionManager;
  const emailAccountId = "test-account-id";

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      watchEmails: vi.fn(),
      unwatchEmails: vi.fn(),
    } as unknown as EmailProvider;
    manager = new OutlookSubscriptionManager(mockProvider, emailAccountId);
  });

  describe("createSubscription", () => {
    it("should cancel existing subscription before creating new one", async () => {
      // Mock existing subscription in database
      const existingSubscriptionId = "old-subscription-id";
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: existingSubscriptionId,
      } as any);

      // Mock new subscription creation
      const newSubscription = {
        subscriptionId: "new-subscription-id",
        expirationDate: new Date(),
      };
      vi.mocked(mockProvider.watchEmails).mockResolvedValue(newSubscription);

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(mockProvider.unwatchEmails).toHaveBeenCalledWith(
        existingSubscriptionId,
      );
      expect(mockProvider.watchEmails).toHaveBeenCalled();
      expect(result).toEqual(newSubscription);
    });

    it("should create subscription even if no existing subscription exists", async () => {
      // Mock no existing subscription
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: null,
      } as any);

      const newSubscription = {
        subscriptionId: "new-subscription-id",
        expirationDate: new Date(),
      };
      vi.mocked(mockProvider.watchEmails).mockResolvedValue(newSubscription);

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(mockProvider.unwatchEmails).not.toHaveBeenCalled();
      expect(mockProvider.watchEmails).toHaveBeenCalled();
      expect(result).toEqual(newSubscription);
    });

    it("should continue creating subscription even if canceling old one fails", async () => {
      // Mock existing subscription
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: "old-subscription-id",
      } as any);

      // Mock unwatchEmails to fail
      vi.mocked(mockProvider.unwatchEmails).mockRejectedValue(
        new Error("Subscription not found"),
      );

      const newSubscription = {
        subscriptionId: "new-subscription-id",
        expirationDate: new Date(),
      };
      vi.mocked(mockProvider.watchEmails).mockResolvedValue(newSubscription);

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(mockProvider.unwatchEmails).toHaveBeenCalled();
      expect(mockProvider.watchEmails).toHaveBeenCalled();
      expect(result).toEqual(newSubscription);
    });

    it("should return null if creating new subscription fails", async () => {
      // Mock no existing subscription
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: null,
      } as any);

      // Mock watchEmails to fail
      vi.mocked(mockProvider.watchEmails).mockRejectedValue(
        new Error("API error"),
      );

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("updateSubscriptionInDatabase", () => {
    it("should update database with new subscription details", async () => {
      const subscription = {
        subscriptionId: "test-subscription-id",
        expirationDate: new Date("2024-01-01T00:00:00Z"),
      };

      // Act
      await manager.updateSubscriptionInDatabase(subscription);

      // Assert
      expect(prisma.emailAccount.update).toHaveBeenCalledWith({
        where: { id: emailAccountId },
        data: {
          watchEmailsExpirationDate: new Date("2024-01-01T00:00:00Z"),
          watchEmailsSubscriptionId: "test-subscription-id",
        },
      });
    });
  });
});
