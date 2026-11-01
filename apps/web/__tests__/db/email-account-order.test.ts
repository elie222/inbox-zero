import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { reorderEmailAccountsAction } from "@/utils/actions/all-accounts";
import { EMAIL_ACCOUNT_ORDER_BY } from "@/utils/email-account-order";

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: userId, email: "order-first@example.com" },
  })),
}));

const userId = "email-account-order-test-user";
const otherUserId = "email-account-order-test-other-user";

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "email account order (real database)",
  () => {
    beforeEach(async () => {
      await prisma.user.deleteMany({
        where: { id: { in: [userId, otherUserId] } },
      });
      await prisma.user.create({
        data: { id: userId, email: "order-first@example.com" },
      });
      await prisma.user.create({
        data: { id: otherUserId, email: "order-other@example.com" },
      });
      await createEmailAccount(userId, "first", new Date("2024-01-01"));
      await createEmailAccount(userId, "second", new Date("2024-01-02"));
      await createEmailAccount(userId, "third", new Date("2024-01-03"));
      await createEmailAccount(otherUserId, "other", new Date("2024-01-01"));
    });
    afterAll(async () => {
      await prisma.user.deleteMany({
        where: { id: { in: [userId, otherUserId] } },
      });
    });

    it("lists accounts in connection order until the user reorders them", async () => {
      expect(await listAccountIds()).toEqual(ids("first", "second", "third"));
    });

    it("lists accounts in the saved order, with newer accounts after them", async () => {
      const result = await reorderEmailAccountsAction({
        emailAccountIds: ids("third", "first", "second"),
      });
      expect(result?.serverError).toBeUndefined();

      await createEmailAccount(userId, "fourth", new Date("2024-01-04"));

      expect(await listAccountIds()).toEqual(
        ids("third", "first", "second", "fourth"),
      );
    });

    it("leaves every position unchanged when another user's account is included", async () => {
      const result = await reorderEmailAccountsAction({
        emailAccountIds: ids("third", "first", "other"),
      });

      expect(result?.serverError).toBeDefined();
      expect(await listAccountIds()).toEqual(ids("first", "second", "third"));
      expect(
        await prisma.emailAccount.findUnique({
          where: { id: accountId("other") },
          select: { sortOrder: true },
        }),
      ).toEqual({ sortOrder: null });
    });
  },
);

async function createEmailAccount(
  ownerId: string,
  key: string,
  createdAt: Date,
) {
  const account = await prisma.account.create({
    data: {
      userId: ownerId,
      provider: "google",
      providerAccountId: `email-account-order-${key}`,
    },
  });
  await prisma.emailAccount.create({
    data: {
      id: accountId(key),
      email: `order-${key}@example.com`,
      userId: ownerId,
      accountId: account.id,
      createdAt,
    },
  });
}

async function listAccountIds() {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: { id: true },
    orderBy: EMAIL_ACCOUNT_ORDER_BY,
  });
  return accounts.map((account) => account.id);
}

function ids(...keys: string[]) {
  return keys.map(accountId);
}

function accountId(key: string) {
  return `email-account-order-test-${key}`;
}
