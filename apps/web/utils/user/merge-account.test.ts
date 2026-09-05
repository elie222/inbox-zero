import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeAccount } from "./merge-account";
import prisma from "@/utils/__mocks__/prisma";
import { getMockUserSelect, createTestLogger } from "@/__tests__/helpers";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { redis } from "@/utils/redis";
import { getPremiumTransferOperations } from "@/utils/user/merge-premium";

vi.mock("@/utils/prisma");
vi.mock("@/utils/user/merge-premium");
vi.mock("server-only", () => ({}));
vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

const logger = createTestLogger();
const validationCache = new Map<string, unknown>();

describe("mergeAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validationCache.clear();
    vi.mocked(redis.get).mockImplementation(
      async (key) => validationCache.get(String(key)) ?? null,
    );
    vi.mocked(redis.set).mockImplementation(async (key, value) => {
      validationCache.set(String(key), value);
      return "OK";
    });
    vi.mocked(redis.del).mockImplementation(async (key) =>
      validationCache.delete(String(key)) ? 1 : 0,
    );
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

    it("revokes cached access for the source user after a partial reassignment", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const accountId = "account-id";
      const emailAccountId = "email-2";

      prisma.emailAccount.findUnique
        .mockResolvedValueOnce({ email: "secondary@test.com" } as any)
        .mockResolvedValueOnce(null);
      prisma.emailAccount.findMany.mockResolvedValue([
        {
          id: "email-1",
          email: "primary@test.com",
          accountId: "other-account",
        },
        {
          id: emailAccountId,
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

      await expect(
        getEmailAccount({ userId: sourceUserId, emailAccountId }),
      ).resolves.toBe("secondary@test.com");

      await mergeAccount({
        sourceAccountId: accountId,
        sourceUserId,
        targetUserId,
        email: "secondary@test.com",
        name: "Test User",
        logger,
      });

      await expect(
        getEmailAccount({ userId: sourceUserId, emailAccountId }),
      ).resolves.toBeNull();
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

      vi.mocked(getPremiumTransferOperations).mockResolvedValue([]);

      const result = await mergeAccount({
        sourceAccountId: accountId,
        sourceUserId,
        targetUserId,
        email: "only@test.com",
        name: "Test User",
        logger,
      });

      expect(result).toBe("full_merge");
      expect(getPremiumTransferOperations).toHaveBeenCalledWith({
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
        where: {
          id: sourceUserId,
          accounts: { none: {} },
          emailAccounts: { none: {} },
        },
      });
    });

    it("revokes cached access for the source user after a full merge", async () => {
      const sourceUserId = "source-user-id";
      const targetUserId = "target-user-id";
      const accountId = "account-id";
      const emailAccountId = "email-1";

      prisma.emailAccount.findUnique
        .mockResolvedValueOnce({ email: "only@test.com" } as any)
        .mockResolvedValueOnce(null);
      prisma.emailAccount.findMany.mockResolvedValue([
        {
          id: emailAccountId,
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

      vi.mocked(getPremiumTransferOperations).mockResolvedValue([]);

      await expect(
        getEmailAccount({ userId: sourceUserId, emailAccountId }),
      ).resolves.toBe("only@test.com");

      await mergeAccount({
        sourceAccountId: accountId,
        sourceUserId,
        targetUserId,
        email: "only@test.com",
        name: "Test User",
        logger,
      });

      await expect(
        getEmailAccount({ userId: sourceUserId, emailAccountId }),
      ).resolves.toBeNull();
    });
  });
});
