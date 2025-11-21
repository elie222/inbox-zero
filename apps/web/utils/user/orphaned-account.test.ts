import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanupOrphanedAccount } from "./orphaned-account";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getMockAccountWithEmailAccount } from "@/__tests__/helpers";

const logger = createScopedLogger("test");

vi.mock("@/utils/prisma");

describe("cleanupOrphanedAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip cleanup if account not found", async () => {
    prisma.account.findUnique.mockResolvedValue(null);

    await cleanupOrphanedAccount("account-id", logger);

    expect(prisma.account.delete).not.toHaveBeenCalled();
  });

  it("should skip cleanup if account has email account", async () => {
    prisma.account.findUnique.mockResolvedValue(
      getMockAccountWithEmailAccount({
        id: "account-id",
        userId: "user-id",
        emailAccount: { id: "email-id" },
      }) as any,
    );

    await cleanupOrphanedAccount("account-id", logger);

    expect(prisma.account.delete).not.toHaveBeenCalled();
  });

  it("should delete account and user when user has no other email accounts", async () => {
    prisma.account.findUnique.mockResolvedValue(
      getMockAccountWithEmailAccount({
        id: "account-id",
        userId: "user-id",
        emailAccount: null,
      }) as any,
    );

    prisma.emailAccount.count.mockResolvedValue(0);
    prisma.account.delete.mockResolvedValue({} as any);
    prisma.user.delete.mockResolvedValue({} as any);
    prisma.$transaction.mockImplementation((ops) => Promise.resolve(ops));

    await cleanupOrphanedAccount("account-id", logger);

    expect(prisma.emailAccount.count).toHaveBeenCalledWith({
      where: { userId: "user-id" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(), // account delete
      expect.anything(), // user delete
    ]);
  });

  it("should delete only account when user has other email accounts", async () => {
    prisma.account.findUnique.mockResolvedValue(
      getMockAccountWithEmailAccount({
        id: "account-id",
        userId: "user-id",
        emailAccount: null,
      }) as any,
    );

    prisma.emailAccount.count.mockResolvedValue(2);
    prisma.account.delete.mockResolvedValue({} as any);

    await cleanupOrphanedAccount("account-id", logger);

    expect(prisma.account.delete).toHaveBeenCalledWith({
      where: { id: "account-id" },
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
