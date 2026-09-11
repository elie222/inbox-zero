import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDeletedAccountOwnershipImpact,
  getUserDeletionOwnershipImpact,
} from "@/utils/organizations/ownership";

vi.mock("@/utils/prisma");

describe("getDeletedAccountOwnershipImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks organizations for deletion when deleted email accounts include every member", async () => {
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

    const result = await getDeletedAccountOwnershipImpact(["email-account-1"]);

    expect(result.organizationsRequiringOwnershipTransfer).toEqual([]);
    expect(result.organizationsToDelete).toEqual([
      {
        id: "org-1",
        name: "Org",
        members: [{ emailAccountId: "email-account-1", role: "owner" }],
      },
    ]);
  });

  it("marks ownerless organizations for deletion when deleted email accounts include every member", async () => {
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

    const result = await getDeletedAccountOwnershipImpact(["email-account-1"]);

    expect(result.organizationsRequiringOwnershipTransfer).toEqual([]);
    expect(result.organizationsToDelete).toEqual([
      {
        id: "org-1",
        name: "Org",
        members: [{ emailAccountId: "email-account-1", role: "admin" }],
      },
    ]);
  });

  it("requires ownership transfer when an organization would keep members but no owner", async () => {
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

    const result = await getDeletedAccountOwnershipImpact(["email-account-1"]);

    expect(result.organizationsRequiringOwnershipTransfer).toEqual([
      {
        id: "org-1",
        name: "Org",
        members: [
          { emailAccountId: "email-account-1", role: "owner" },
          { emailAccountId: "email-account-2", role: "member" },
        ],
      },
    ]);
    expect(result.organizationsToDelete).toEqual([]);
  });

  it("ignores organizations with another owner outside the deleted accounts", async () => {
    prisma.member.findMany.mockResolvedValue([
      { organizationId: "org-1" },
    ] as Awaited<ReturnType<typeof prisma.member.findMany>>);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Org",
        members: [
          { emailAccountId: "email-account-1", role: "owner" },
          { emailAccountId: "email-account-2", role: "owner" },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.organization.findMany>>);

    const result = await getDeletedAccountOwnershipImpact(["email-account-1"]);

    expect(result).toEqual({
      organizationsRequiringOwnershipTransfer: [],
      organizationsToDelete: [],
    });
  });
});

describe("getUserDeletionOwnershipImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks every email account owned by the deleted user", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "email-account-1" },
      { id: "email-account-2" },
    ] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>);
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

    const result = await getUserDeletionOwnershipImpact("user-1");

    expect(result.organizationsToDelete).toHaveLength(1);
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    });
  });
});
