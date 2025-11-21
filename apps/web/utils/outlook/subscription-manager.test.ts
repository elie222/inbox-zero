import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutlookSubscriptionManager } from "@/utils/outlook/subscription-manager";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { SubscriptionHistoryEntry } from "@/utils/outlook/subscription-history";

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
      expect(result).toEqual(
        expect.objectContaining({ ...newSubscription, changed: true }),
      );
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
      expect(result).toEqual(
        expect.objectContaining({ ...newSubscription, changed: true }),
      );
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
      expect(result).toEqual(
        expect.objectContaining({ ...newSubscription, changed: true }),
      );
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
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        id: emailAccountId,
        watchEmailsSubscriptionId: null,
        watchEmailsSubscriptionHistory: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any);

      const subscription = {
        subscriptionId: "test-subscription-id",
        expirationDate: new Date("2024-01-01T00:00:00Z"),
      };

      await manager.updateSubscriptionInDatabase(subscription);

      expect(prisma.emailAccount.update).toHaveBeenCalledWith({
        where: { id: emailAccountId },
        data: {
          watchEmailsExpirationDate: new Date("2024-01-01T00:00:00Z"),
          watchEmailsSubscriptionId: "test-subscription-id",
          watchEmailsSubscriptionHistory: [],
        },
      });
    });

    it("should move old subscription to history when updating to new subscription", async () => {
      const oldSubscriptionId = "old-subscription-id";
      const accountCreatedAt = new Date("2024-01-01T00:00:00Z");

      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        id: emailAccountId,
        watchEmailsSubscriptionId: oldSubscriptionId,
        watchEmailsSubscriptionHistory: null,
        createdAt: accountCreatedAt,
      } as any);

      const subscription = {
        subscriptionId: "new-subscription-id",
        expirationDate: new Date("2024-01-15T00:00:00Z"),
      };

      await manager.updateSubscriptionInDatabase(subscription);

      const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0];
      const history = updateCall.data
        .watchEmailsSubscriptionHistory as SubscriptionHistoryEntry[];

      expect(updateCall.data.watchEmailsSubscriptionId).toBe(
        "new-subscription-id",
      );
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        subscriptionId: oldSubscriptionId,
        createdAt: accountCreatedAt.toISOString(),
      });
      expect(history[0].replacedAt).toBeDefined();
    });

    it("should preserve existing history when adding new entry", async () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const existingHistory = [
        {
          subscriptionId: "previous-subscription",
          createdAt: tenDaysAgo.toISOString(),
          replacedAt: fiveDaysAgo.toISOString(),
        },
      ];

      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        id: emailAccountId,
        watchEmailsSubscriptionId: "old-subscription-id",
        watchEmailsSubscriptionHistory: existingHistory,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any);

      const subscription = {
        subscriptionId: "new-subscription-id",
        expirationDate: new Date("2024-01-15T00:00:00Z"),
      };

      await manager.updateSubscriptionInDatabase(subscription);

      const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0];
      const history = updateCall.data
        .watchEmailsSubscriptionHistory as SubscriptionHistoryEntry[];

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(existingHistory[0]);
      expect(history[1].subscriptionId).toBe("old-subscription-id");
    });

    it("should clean up history entries older than 30 days", async () => {
      const now = new Date();
      const thirtyOneDaysAgo = new Date(
        now.getTime() - 31 * 24 * 60 * 60 * 1000,
      );
      const twentyNineDaysAgo = new Date(
        now.getTime() - 29 * 24 * 60 * 60 * 1000,
      );

      const existingHistory = [
        {
          subscriptionId: "very-old-subscription",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: thirtyOneDaysAgo.toISOString(),
        },
        {
          subscriptionId: "recent-subscription",
          createdAt: "2024-01-10T00:00:00Z",
          replacedAt: twentyNineDaysAgo.toISOString(),
        },
      ];

      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        id: emailAccountId,
        watchEmailsSubscriptionId: "current-subscription-id",
        watchEmailsSubscriptionHistory: existingHistory,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any);

      const subscription = {
        subscriptionId: "new-subscription-id",
        expirationDate: new Date("2024-01-15T00:00:00Z"),
      };

      await manager.updateSubscriptionInDatabase(subscription);

      const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0];
      const history = updateCall.data
        .watchEmailsSubscriptionHistory as SubscriptionHistoryEntry[];

      // Should only have the recent entry + the new one being added
      expect(history).toHaveLength(2);
      expect(history[0].subscriptionId).toBe("recent-subscription");
      expect(history[1].subscriptionId).toBe("current-subscription-id");
    });

    it("should not add to history when subscription ID has not changed", async () => {
      const currentSubscriptionId = "same-subscription-id";

      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        id: emailAccountId,
        watchEmailsSubscriptionId: currentSubscriptionId,
        watchEmailsSubscriptionHistory: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any);

      const subscription = {
        subscriptionId: currentSubscriptionId,
        expirationDate: new Date("2024-01-15T00:00:00Z"),
      };

      await manager.updateSubscriptionInDatabase(subscription);

      const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0];
      expect(updateCall.data.watchEmailsSubscriptionHistory).toHaveLength(0);
    });
  });
});
