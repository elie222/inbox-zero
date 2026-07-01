import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { deleteUser } from "@/utils/user/delete";

vi.mock("@/utils/prisma");
vi.mock("@inboxzero/loops", () => ({
  deleteContact: vi.fn(),
}));
vi.mock("@inboxzero/resend", () => ({
  deleteContact: vi.fn(),
}));
vi.mock("@inboxzero/tinybird-ai-analytics", () => ({
  deleteTinybirdAiCalls: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/utils/posthog", () => ({
  deletePosthogUser: vi.fn(() => Promise.resolve()),
  trackUserDeleted: vi.fn(() => Promise.resolve()),
  trackUserDeletionRequested: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/utils/email/watch-manager", () => ({
  unwatchEmails: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/redis/research-cache", () => ({
  clearCachedResearchForUser: vi.fn(() => Promise.resolve()),
}));

const logger = createTestLogger();

describe("deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.member.findMany.mockResolvedValue([]);
  });

  it("does not delete a user when their email accounts own an organization with remaining members", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        provider: "google",
        access_token: null,
        refresh_token: null,
        expires_at: null,
        emailAccount: {
          id: "email-account-1",
          email: "owner@example.com",
          watchEmailsSubscriptionId: null,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>);
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [
          { emailAccountId: "email-account-1", role: "owner" },
          { emailAccountId: "email-account-2", role: "member" },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);

    await expect(deleteUser({ userId: "user-1", logger })).rejects.toThrow(
      "Transfer organization ownership before deleting your account.",
    );

    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes solo organizations before deleting the user", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        provider: "google",
        access_token: null,
        refresh_token: null,
        expires_at: null,
        emailAccount: {
          id: "email-account-1",
          email: "owner@example.com",
          watchEmailsSubscriptionId: null,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>);
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [{ emailAccountId: "email-account-1", role: "owner" }],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);
    prisma.executedRule.findMany.mockResolvedValue([]);
    prisma.user.deleteMany.mockResolvedValue({ count: 1 } as any);

    await deleteUser({ userId: "user-1", logger });

    expect(prisma.organization.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["org-1"] },
        members: {
          every: {
            emailAccountId: { in: ["email-account-1"] },
          },
        },
      },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
  });

  it("deletes ownerless solo organizations before deleting the user", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        provider: "google",
        access_token: null,
        refresh_token: null,
        expires_at: null,
        emailAccount: {
          id: "email-account-1",
          email: "admin@example.com",
          watchEmailsSubscriptionId: null,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>);
    prisma.member.findMany.mockImplementation(async (args) => {
      const roleFilter = (
        args as Parameters<typeof prisma.member.findMany>[0] | undefined
      )?.where?.role;

      return (roleFilter ? [] : [{ organizationId: "org-1" }]) as Awaited<
        ReturnType<typeof prisma.member.findMany>
      >;
    });
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [{ emailAccountId: "email-account-1", role: "admin" }],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);
    prisma.executedRule.findMany.mockResolvedValue([]);
    prisma.user.deleteMany.mockResolvedValue({ count: 1 } as any);

    await deleteUser({ userId: "user-1", logger });

    expect(prisma.organization.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["org-1"] },
        members: {
          every: {
            emailAccountId: { in: ["email-account-1"] },
          },
        },
      },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
  });

  it("surfaces the ownership transfer message when the database rejects a raced user deletion", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        provider: "google",
        access_token: null,
        refresh_token: null,
        expires_at: null,
        emailAccount: {
          id: "email-account-1",
          email: "owner@example.com",
          watchEmailsSubscriptionId: null,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>);
    prisma.executedRule.findMany.mockResolvedValue([]);
    prisma.user.deleteMany.mockRejectedValue(
      new Error("organization_must_have_owner"),
    );

    await expect(deleteUser({ userId: "user-1", logger })).rejects.toThrow(
      "Transfer organization ownership before deleting your account.",
    );
  });

  it("surfaces the ownership transfer message when membership blocks raced user deletion", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        provider: "google",
        access_token: null,
        refresh_token: null,
        expires_at: null,
        emailAccount: {
          id: "email-account-1",
          email: "owner@example.com",
          watchEmailsSubscriptionId: null,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.account.findMany>>);
    prisma.executedRule.findMany.mockResolvedValue([]);
    prisma.user.deleteMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed",
        {
          code: "P2003",
          clientVersion: "test",
          meta: { field_name: "Member_emailAccountId_fkey" },
        },
      ),
    );

    await expect(deleteUser({ userId: "user-1", logger })).rejects.toThrow(
      "Transfer organization ownership before deleting your account.",
    );
  });
});
