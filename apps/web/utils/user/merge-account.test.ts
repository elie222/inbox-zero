import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeAccount } from "./merge-account";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getMockUserSelect } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/user/merge-premium");

const logger = createScopedLogger("test");

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
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.anything(), // account update
          expect.anything(), // email account update
          expect.anything(), // user update (primary email change)
        ]),
      );
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
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.anything(), // account update
          expect.anything(), // email account update
        ]),
      );
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.not.arrayContaining([
          expect.objectContaining({ model: "user" }),
        ]),
      );
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
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.anything(), // account update
          expect.anything(), // email account update
          expect.anything(), // user delete
        ]),
      );
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: sourceUserId },
      });
    });
  });
});
