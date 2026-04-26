import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeAccount } from "./merge-account";
import prisma from "@/utils/__mocks__/prisma";
import { getMockUserSelect, createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/user/merge-premium");

const logger = createTestLogger();

describe("mergeAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("source user has multiple email accounts", () => {
    it("should reassign account and update source user primary email when moving primary", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const accountId = "account-id";

      prisma.emailAccount.findMany.mockResolvedValue([
        {
          id: "email-1",
          email: "primary@test.com",
          accountId,
        },
        {
          id: "email-2",
          email: "secondary@test.com",
          accountId: "other-account",
        },
      ] as any);

      prisma.user.findUnique.mockResolvedValue(
        getMockUserSelect({ email: "primary@test.com" }) as any,
      );

      prisma.account.update.mockResolvedValue({} as any);
      prisma.emailAccount.update.mockResolvedValue({} as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.$transaction.mockImplementation((ops) => Promise.resolve(ops));

      const result = await mergeAccount({
        sourceAccountId: accountId,
        sourceUserId,
        targetUserId,
        email: "primary@test.com",
        name: "Test User",
        logger,
      });

      expect(result).toBe("partial_reassign");
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { userId: targetUserId },
      });
      expect(prisma.emailAccount.update).toHaveBeenCalledWith({
        where: { accountId },
        data: {
          userId: targetUserId,
          name: "Test User",
          email: "primary@test.com",
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: sourceUserId },
        data: { email: "secondary@test.com" },
      });
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("should reassign account without updating primary when moving non-primary", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const accountId = "account-id";

      prisma.emailAccount.findMany.mockResolvedValue([
        {
          id: "email-1",
          email: "primary@test.com",
          accountId: "other-account",
        },
        {
          id: "email-2",
          email: "secondary@test.com",
          accountId,
        },
      ] as any);

      prisma.user.findUnique.mockResolvedValue(
        getMockUserSelect({ email: "primary@test.com" }) as any,
      );

      prisma.account.update.mockResolvedValue({} as any);
      prisma.emailAccount.update.mockResolvedValue({} as any);
      prisma.$transaction.mockImplementation((ops) => Promise.resolve(ops));

      const result = await mergeAccount({
        sourceAccountId: accountId,
        sourceUserId,
        targetUserId,
        email: "secondary@test.com",
        name: "Test User",
        logger,
      });

      expect(result).toBe("partial_reassign");
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { userId: targetUserId },
      });
      expect(prisma.emailAccount.update).toHaveBeenCalledWith({
        where: { accountId },
        data: {
          userId: targetUserId,
          name: "Test User",
          email: "secondary@test.com",
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("source user has only one email account", () => {
    it("should do full merge and delete source user", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const accountId = "account-id";

      prisma.emailAccount.findMany.mockResolvedValue([
        {
          id: "email-1",
          email: "only@test.com",
          accountId,
        },
      ] as any);

      prisma.user.findUnique.mockResolvedValue(
        getMockUserSelect({ email: "only@test.com" }) as any,
      );

      prisma.account.update.mockResolvedValue({} as any);
      prisma.emailAccount.update.mockResolvedValue({} as any);
      prisma.user.delete.mockResolvedValue({} as any);
      prisma.$transaction.mockImplementation((ops) => Promise.resolve(ops));

      const { transferPremiumDuringMerge } = await import(
        "@/utils/user/merge-premium"
      );
      vi.mocked(transferPremiumDuringMerge).mockResolvedValue();

      const result = await mergeAccount({
        sourceAccountId: accountId,
        sourceUserId,
        targetUserId,
        email: "only@test.com",
        name: "Test User",
        logger,
      });

      expect(result).toBe("full_merge");
      expect(transferPremiumDuringMerge).toHaveBeenCalledWith({
        sourceUserId,
        targetUserId,
        logger,
      });
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { userId: targetUserId },
      });
      expect(prisma.emailAccount.update).toHaveBeenCalledWith({
        where: { accountId },
        data: {
          userId: targetUserId,
          name: "Test User",
          email: "only@test.com",
        },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: sourceUserId },
      });
    });
  });
});
