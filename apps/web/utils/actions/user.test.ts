import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { updateAccountSeats } from "@/utils/premium/seats";
import { aliasPosthogUser } from "@/utils/posthog";
import { betterAuthConfig } from "@/utils/auth";
import { deleteUser } from "@/utils/user/delete";
import { deleteAccountAction, deleteEmailAccountAction } from "./user";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "primary@example.com" },
  })),
  betterAuthConfig: {
    api: {
      signOut: vi.fn(() => Promise.resolve()),
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("@/utils/cookies.server", () => ({
  clearLastEmailAccountCookie: vi.fn(() => Promise.resolve()),
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
    prisma.emailAccount.delete.mockResolvedValue({
      id: "primary-email-account",
    } as any);
    prisma.account.delete.mockResolvedValue({ id: "account-1" } as any);
    prisma.user.update.mockResolvedValue({ id: "user-1" } as any);
    prisma.$queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: "" }]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Promise<unknown>[]),
    );
    prisma.member.findMany.mockResolvedValue([]);
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
        expect.stringContaining("SELECT true AS locked"),
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
    expect(prisma.emailAccount.delete).toHaveBeenCalledWith({
      where: {
        id: "primary-email-account",
        userId: "user-1",
        accountId: "account-1",
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
    prisma.emailAccount.delete.mockRejectedValue(newPrismaNotFoundError());

    const result = await deleteEmailAccountAction({
      emailAccountId: "alternate-email-account",
    });

    expect(result?.serverError).toBe("Email account already changed");
    expect(prisma.emailAccount.delete).toHaveBeenCalledWith({
      where: {
        id: "alternate-email-account",
        userId: "user-1",
        accountId: "account-2",
        user: { email: "primary@example.com" },
      },
    });
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("shows a specific error when the remaining email is already in use", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.$transaction.mockRejectedValue(
      newPrismaKnownError("Unique constraint failed", "P2002", {
        target: ["email"],
      }),
    );

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe(
      "We couldn't make the remaining email account primary because that email is already in use.",
    );
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("shows a specific error when linked data blocks account deletion", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.$transaction.mockRejectedValue(
      newPrismaKnownError("Foreign key constraint failed", "P2003"),
    );

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe(
      "We couldn't delete this email account because linked data still exists. Please contact support.",
    );
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("shows the ownership transfer message when membership blocks account deletion", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.$transaction.mockRejectedValue(
      newPrismaKnownError("Foreign key constraint failed", "P2003", {
        field_name: "Member_emailAccountId_fkey",
      }),
    );

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe(
      "Transfer organization ownership before deleting this email account.",
    );
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("shows an action-specific fallback for unexpected delete failures", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.$transaction.mockRejectedValue(new Error("database unavailable"));

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe(
      "We couldn't delete this email account. Please contact support if this keeps happening.",
    );
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("does not delete an email account when an organization would keep members but no owner", async () => {
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [
          { emailAccountId: "primary-email-account", role: "owner" },
          { emailAccountId: "other-email-account", role: "member" },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe(
      "Transfer organization ownership before deleting this email account.",
    );
    expect(prisma.emailAccount.delete).not.toHaveBeenCalled();
    expect(prisma.account.delete).not.toHaveBeenCalled();
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });

  it("deletes a solo organization before deleting its only email account", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [{ emailAccountId: "primary-email-account", role: "owner" }],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.organization.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["org-1"] },
        members: {
          every: {
            emailAccountId: { in: ["primary-email-account"] },
          },
        },
      },
    });
    expect(prisma.emailAccount.delete).toHaveBeenCalled();
  });

  it("shows the ownership transfer message when the database rejects a raced owner deletion", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "alternate-email-account",
        email: "alternate@example.com",
        name: "Alternate",
        image: null,
      },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.$transaction.mockRejectedValue(
      new Error("organization_must_have_owner"),
    );

    const result = await deleteEmailAccountAction({
      emailAccountId: "primary-email-account",
    });

    expect(result?.serverError).toBe(
      "Transfer organization ownership before deleting this email account.",
    );
    expect(updateAccountSeats).not.toHaveBeenCalled();
  });
});

describe("deleteAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findMany.mockResolvedValue([]);
    prisma.member.findMany.mockResolvedValue([]);
  });

  it("does not sign out before blocking account deletion when an organization would keep members but no owner", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "primary-email-account" },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [
          { emailAccountId: "primary-email-account", role: "owner" },
          { emailAccountId: "other-email-account", role: "member" },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);

    const result = await deleteAccountAction();

    expect(result?.serverError).toBe(
      "Transfer organization ownership before deleting your account.",
    );
    expect(betterAuthConfig.api.signOut).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("allows account deletion when every organization member belongs to the deleted user", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "primary-email-account" },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [{ emailAccountId: "primary-email-account", role: "owner" }],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);

    const result = await deleteAccountAction();

    expect(result?.serverError).toBeUndefined();
    expect(betterAuthConfig.api.signOut).toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith({
      userId: "user-1",
      logger: expect.anything(),
    });
  });
});

function newPrismaNotFoundError() {
  return newPrismaKnownError("Record not found", "P2025");
}

function newPrismaKnownError(
  message: string,
  code: string,
  meta?: Record<string, unknown>,
) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "test",
    meta,
  });
}
