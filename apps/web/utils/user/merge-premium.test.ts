import { beforeEach, describe, expect, it, vi } from "vitest";
import { PremiumTier } from "@prisma/client";
import { transferPremiumDuringMerge } from "./merge-premium";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("server-only", () => ({}));

describe("transferPremiumDuringMerge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when both users have premium subscriptions", () => {
    it("should choose source premium when source has higher tier", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sourcePremiumId = "source-premium-id";
      const targetPremiumId = "target-premium-id";

      // Mock source user with BUSINESS_PLUS tier (higher)
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: sourcePremiumId,
          premiumAdminId: null,
          premium: {
            id: sourcePremiumId,
            tier: PremiumTier.BUSINESS_PLUS_MONTHLY,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [],
          },
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: targetPremiumId,
          premiumAdminId: null,
          premium: {
            id: targetPremiumId,
            tier: PremiumTier.PRO_MONTHLY,
          },
        } as any);

      prisma.user.update.mockResolvedValue({} as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not call premium.update since we use atomic user.update
      expect(prisma.premium.update).not.toHaveBeenCalled();

      // Should update target user to use source's premium (atomic operation)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: { premiumId: sourcePremiumId },
      });
    });

    it("should keep target premium when target has higher tier", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sourcePremiumId = "source-premium-id";
      const targetPremiumId = "target-premium-id";

      // Mock source user with PRO tier (lower)
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: sourcePremiumId,
          premiumAdminId: null,
          premium: {
            id: sourcePremiumId,
            tier: PremiumTier.PRO_MONTHLY,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [],
          },
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: targetPremiumId,
          premiumAdminId: null,
          premium: {
            id: targetPremiumId,
            tier: PremiumTier.BUSINESS_PLUS_MONTHLY,
          },
        } as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not make any premium updates since target has higher tier
      expect(prisma.premium.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("should choose source premium when both have same tier", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sourcePremiumId = "source-premium-id";
      const targetPremiumId = "target-premium-id";

      // Mock both users with same tier
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: sourcePremiumId,
          premiumAdminId: null,
          premium: {
            id: sourcePremiumId,
            tier: PremiumTier.PRO_MONTHLY,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [],
          },
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: targetPremiumId,
          premiumAdminId: null,
          premium: {
            id: targetPremiumId,
            tier: PremiumTier.PRO_MONTHLY,
          },
        } as any);

      prisma.user.update.mockResolvedValue({} as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not call premium.update since we use atomic user.update
      expect(prisma.premium.update).not.toHaveBeenCalled();

      // Should update target user to use source's premium (atomic operation)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: { premiumId: sourcePremiumId },
      });
    });

    it("should do nothing when both users already share the same premium", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sharedPremiumId = "shared-premium-id";

      // Mock both users with same premium
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: sharedPremiumId,
          premiumAdminId: null,
          premium: {
            id: sharedPremiumId,
            tier: PremiumTier.PRO_MONTHLY,
            users: [
              { id: sourceUserId, email: "source@example.com" },
              { id: targetUserId, email: "target@example.com" },
            ],
            admins: [],
          },
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: sharedPremiumId,
          premiumAdminId: null,
          premium: {
            id: sharedPremiumId,
            tier: PremiumTier.PRO_MONTHLY,
          },
        } as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not make any updates since they share the same premium
      expect(prisma.premium.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("when only source user has premium", () => {
    it("should transfer premium to target user", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sourcePremiumId = "source-premium-id";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: sourcePremiumId,
          premiumAdminId: null,
          premium: {
            id: sourcePremiumId,
            tier: PremiumTier.PRO_MONTHLY,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [],
          },
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
        } as any);

      prisma.user.update.mockResolvedValue({} as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should update target user to use source's premium
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: { premiumId: sourcePremiumId },
      });
    });
  });

  describe("when only target user has premium", () => {
    it("should keep target user's premium", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const targetPremiumId = "target-premium-id";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: targetPremiumId,
          premiumAdminId: null,
          premium: {
            id: targetPremiumId,
            tier: PremiumTier.PRO_MONTHLY,
          },
        } as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not make any updates since target already has premium
      expect(prisma.premium.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("when neither user has premium", () => {
    it("should do nothing", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
        } as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not make any updates since neither has premium
      expect(prisma.premium.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("when source user has premium admin rights", () => {
    it("should transfer admin rights to target user", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const premiumAdminId = "premium-admin-id";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: null,
          premiumAdminId: premiumAdminId,
          premium: null,
          premiumAdmin: {
            id: premiumAdminId,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [{ id: sourceUserId, email: "source@example.com" }],
          },
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
        } as any);

      prisma.premium.update.mockResolvedValue({} as any);
      prisma.user.update.mockResolvedValue({} as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should connect target user as admin
      expect(prisma.premium.update).toHaveBeenCalledWith({
        where: { id: premiumAdminId },
        data: {
          admins: {
            connect: { id: targetUserId },
          },
        },
      });

      // Should update target user's premiumAdminId
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: { premiumAdminId: premiumAdminId },
      });
    });

    it("should not update premiumAdminId when target already has admin rights", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sourcePremiumAdminId = "source-premium-admin-id";
      const targetPremiumAdminId = "target-premium-admin-id";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: null,
          premiumAdminId: sourcePremiumAdminId,
          premium: null,
          premiumAdmin: {
            id: sourcePremiumAdminId,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [{ id: sourceUserId, email: "source@example.com" }],
          },
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: null,
          premiumAdminId: targetPremiumAdminId,
          premium: null,
        } as any);

      prisma.premium.update.mockResolvedValue({} as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should connect target user as admin
      expect(prisma.premium.update).toHaveBeenCalledWith({
        where: { id: sourcePremiumAdminId },
        data: {
          admins: {
            connect: { id: targetUserId },
          },
        },
      });

      // Should not update target user's premiumAdminId since they already have one
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should return early when source user is not found", async () => {
      const sourceUserId = "non-existent-source";
      const targetUserId = "target-user-id";

      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: targetUserId,
        email: "target@example.com",
        premiumId: null,
        premiumAdminId: null,
        premium: null,
      } as any);

      await transferPremiumDuringMerge({ sourceUserId, targetUserId });

      // Should not make any updates when source user is not found
      expect(prisma.premium.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("should handle error gracefully when target user is not found", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "non-existent-target";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce(null);

      // Should not throw an error, but should complete gracefully
      await expect(
        transferPremiumDuringMerge({ sourceUserId, targetUserId }),
      ).resolves.toBeUndefined();

      // Should not make any updates when target user is not found
      expect(prisma.premium.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const sourcePremiumId = "source-premium-id";

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: sourceUserId,
          email: "source@example.com",
          premiumId: sourcePremiumId,
          premiumAdminId: null,
          premium: {
            id: sourcePremiumId,
            tier: PremiumTier.PRO_MONTHLY,
            users: [{ id: sourceUserId, email: "source@example.com" }],
            admins: [],
          },
          premiumAdmin: null,
        } as any)
        .mockResolvedValueOnce({
          id: targetUserId,
          email: "target@example.com",
          premiumId: null,
          premiumAdminId: null,
          premium: null,
        } as any);

      // Mock database error
      prisma.user.update.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Should not throw an error, but should complete gracefully
      await expect(
        transferPremiumDuringMerge({ sourceUserId, targetUserId }),
      ).resolves.toBeUndefined();
    });
  });
});
