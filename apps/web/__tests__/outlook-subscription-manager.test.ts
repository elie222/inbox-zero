import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { OutlookSubscriptionManager } from "@/utils/outlook/subscription-manager";
import prisma from "@/utils/prisma";
import { watchOutlook, unwatchOutlook } from "@/utils/outlook/watch";

// Mock dependencies
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/utils/outlook/watch", () => ({
  watchOutlook: vi.fn(),
  unwatchOutlook: vi.fn(),
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
  let mockClient: Client;
  let manager: OutlookSubscriptionManager;
  const emailAccountId = "test-account-id";

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {} as Client;
    manager = new OutlookSubscriptionManager(mockClient, emailAccountId);
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
        id: "new-subscription-id",
        expirationDateTime: new Date().toISOString(),
      };
      vi.mocked(watchOutlook).mockResolvedValue(newSubscription);

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(unwatchOutlook).toHaveBeenCalledWith(
        mockClient,
        existingSubscriptionId,
      );
      expect(watchOutlook).toHaveBeenCalledWith(mockClient);
      expect(result).toEqual(newSubscription);
    });

    it("should create subscription even if no existing subscription exists", async () => {
      // Mock no existing subscription
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: null,
      } as any);

      const newSubscription = {
        id: "new-subscription-id",
        expirationDateTime: new Date().toISOString(),
      };
      vi.mocked(watchOutlook).mockResolvedValue(newSubscription);

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(unwatchOutlook).not.toHaveBeenCalled();
      expect(watchOutlook).toHaveBeenCalledWith(mockClient);
      expect(result).toEqual(newSubscription);
    });

    it("should continue creating subscription even if canceling old one fails", async () => {
      // Mock existing subscription
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: "old-subscription-id",
      } as any);

      // Mock unwatchOutlook to fail
      vi.mocked(unwatchOutlook).mockRejectedValue(
        new Error("Subscription not found"),
      );

      const newSubscription = {
        id: "new-subscription-id",
        expirationDateTime: new Date().toISOString(),
      };
      vi.mocked(watchOutlook).mockResolvedValue(newSubscription);

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(unwatchOutlook).toHaveBeenCalled();
      expect(watchOutlook).toHaveBeenCalledWith(mockClient);
      expect(result).toEqual(newSubscription);
    });

    it("should return null if creating new subscription fails", async () => {
      // Mock no existing subscription
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        watchEmailsSubscriptionId: null,
      } as any);

      // Mock watchOutlook to fail
      vi.mocked(watchOutlook).mockRejectedValue(new Error("API error"));

      // Act
      const result = await manager.createSubscription();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("updateSubscriptionInDatabase", () => {
    it("should update database with new subscription details", async () => {
      const subscription = {
        id: "test-subscription-id",
        expirationDateTime: "2024-01-01T00:00:00Z",
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

    it("should throw error if subscription has no expiration date", async () => {
      const subscription = {
        id: "test-subscription-id",
        expirationDateTime: undefined,
      };

      // Act & Assert
      await expect(
        manager.updateSubscriptionInDatabase(subscription),
      ).rejects.toThrow("Subscription missing expiration date");
    });
  });
});
