import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { updateAccountSeats } from "@/utils/premium/seats";
import { aliasPosthogUser } from "@/utils/posthog";
import { deleteEmailAccountAction } from "./user";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "primary@example.com" },
  })),
  betterAuthConfig: {
    api: {
      signOut: vi.fn(),
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();

  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => callback()),
  };
});
vi.mock("@sentry/nextjs", () => ({
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, callback: () => Promise<unknown>) => callback(),
  ),
}));
vi.mock("@/utils/cookies.server", () => ({
  clearLastEmailAccountCookie: vi.fn(),
}));
vi.mock("@/utils/user/delete", () => ({
  deleteUser: vi.fn(),
}));
vi.mock("@/utils/posthog", () => ({
  aliasPosthogUser: vi.fn(),
}));
vi.mock("@/utils/premium/seats", () => ({
  updateAccountSeats: vi.fn(),
}));
vi.mock("@/utils/ai/draft-cleanup", () => ({
  cleanupAIDraftsForAccount: vi.fn(),
  getConfiguredDraftCleanupDays: vi.fn(),
}));

describe("deleteEmailAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.account.delete.mockResolvedValue({ id: "account-1" } as any);
    prisma.user.update.mockResolvedValue({ id: "user-1" } as any);
    prisma.$queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: "" }]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Promise<unknown>[]),
    );
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "primary@example.com",
      accountId: "account-1",
      user: { email: "primary@example.com" },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
  });

  it("promotes another account before deleting the primary account", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: "https://example.com/avatar.png",
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("pg_advisory_xact_lock"),
      ]),
      "user-1",
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        email: "primary@example.com",
        emailAccounts: { some: { id: "alternate-email-account" } },
      },
      data: {
        email: "alternate@example.com",
        name: "Alternate",
        image: "https://example.com/avatar.png",
      },
    });
    expect(prisma.account.delete).toHaveBeenCalledWith({
      where: { id: "account-1", userId: "user-1" },
    });
    expect(aliasPosthogUser).toHaveBeenCalledWith({
      oldEmail: "primary@example.com",
      newEmail: "alternate@example.com",
    });
    expect(updateAccountSeats).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("does not delete the primary account when promotion loses a concurrent update", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.$transaction.mockRejectedValue(newPrismaNotFoundError());

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe("Email account already changed");
    expect(aliasPosthogUser).not.toHaveBeenCalled();
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("does not delete a promoted account with a stale non-primary request", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "alternate@example.com",
      accountId: "account-2",
      user: { email: "primary@example.com" },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    prisma.account.delete.mockRejectedValue(newPrismaNotFoundError());

    const result = await deleteEmailAccountAction({
      emailAccountId: "alternate-email-account",
    });

    expect(result?.serverError).toBe("Email account already changed");
    expect(prisma.account.delete).toHaveBeenCalledWith({
      where: {
        id: "account-2",
        userId: "user-1",
        emailAccount: { user: { email: "primary@example.com" } },
      },
    });
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });
});

function newPrismaNotFoundError() {
  return new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "test",
  });
}
