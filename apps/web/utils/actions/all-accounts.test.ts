import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  reorderEmailAccountsAction,
  updateAllAccountsSelectionAction,
} from "./all-accounts";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

describe("updateAllAccountsSelectionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "account-1" },
      { id: "account-2" },
      { id: "account-3" },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([]);
  });

  it("includes only the selected accounts owned by the user", async () => {
    const result = await updateAllAccountsSelectionAction({
      emailAccountIds: ["account-1", "account-3"],
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.emailAccount.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        id: { in: ["account-1", "account-3"] },
      },
      data: { includeInAllAccounts: true },
    });
    expect(prisma.emailAccount.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        id: { notIn: ["account-1", "account-3"] },
      },
      data: { includeInAllAccounts: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects an account that does not belong to the user", async () => {
    const result = await updateAllAccountsSelectionAction({
      emailAccountIds: ["account-1", "another-user-account"],
    });

    expect(result?.serverError).toBe("Email account not found");
    expect(prisma.emailAccount.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires at least one account", async () => {
    const result = await updateAllAccountsSelectionAction({
      emailAccountIds: [],
    });

    expect(result?.validationErrors).toBeDefined();
    expect(prisma.emailAccount.findMany).not.toHaveBeenCalled();
  });
});

describe("reorderEmailAccountsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "account-1" },
      { id: "account-2" },
      { id: "account-3" },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([]);
  });

  it("saves each account's new position, scoped to the user", async () => {
    const result = await reorderEmailAccountsAction({
      emailAccountIds: ["account-3", "account-1", "account-2"],
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    });
    expect(prisma.emailAccount.updateMany.mock.calls).toEqual([
      [
        {
          where: { id: "account-3", userId: "user-1" },
          data: { sortOrder: 0 },
        },
      ],
      [
        {
          where: { id: "account-1", userId: "user-1" },
          data: { sortOrder: 1 },
        },
      ],
      [
        {
          where: { id: "account-2", userId: "user-1" },
          data: { sortOrder: 2 },
        },
      ],
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects an account that does not belong to the user", async () => {
    const result = await reorderEmailAccountsAction({
      emailAccountIds: ["account-1", "account-2", "another-user-account"],
    });

    expect(result?.serverError).toBe(
      "Your accounts changed. Refresh the page and try again.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an order that leaves out one of the user's accounts", async () => {
    const result = await reorderEmailAccountsAction({
      emailAccountIds: ["account-2", "account-1"],
    });

    expect(result?.serverError).toBe(
      "Your accounts changed. Refresh the page and try again.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an account listed twice", async () => {
    const result = await reorderEmailAccountsAction({
      emailAccountIds: ["account-1", "account-1", "account-2"],
    });

    expect(result?.validationErrors).toBeDefined();
    expect(prisma.emailAccount.findMany).not.toHaveBeenCalled();
  });
});
