import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { updateMemberRoleAction } from "@/utils/actions/organization";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "admin@example.com" },
  })),
}));

describe("updateMemberRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes a member to admin when the caller is an organization admin", async () => {
    prisma.member.findUnique.mockResolvedValue({
      id: "member-1",
      emailAccountId: "email-account-2",
      organizationId: "org-1",
      role: "member",
    } as any);
    prisma.member.findFirst.mockResolvedValue({
      role: "admin",
      emailAccountId: "email-account-1",
    } as any);
    prisma.member.update.mockResolvedValue({
      id: "member-1",
      role: "admin",
    } as any);

    const result = await updateMemberRoleAction({
      memberId: "member-1",
      role: "admin",
    });

    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "member-1" },
      data: { role: "admin" },
      select: { id: true, role: true },
    });
    expect(result?.data).toEqual({
      id: "member-1",
      role: "admin",
    });
  });

  it("prevents callers from changing their own role", async () => {
    prisma.member.findUnique.mockResolvedValue({
      id: "member-1",
      emailAccountId: "email-account-1",
      organizationId: "org-1",
      role: "admin",
    } as any);
    prisma.member.findFirst.mockResolvedValue({
      role: "owner",
      emailAccountId: "email-account-1",
    } as any);

    const result = await updateMemberRoleAction({
      memberId: "member-1",
      role: "member",
    });

    expect(result?.serverError).toBe("You cannot change your own role.");
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it("does not allow owners to be reassigned", async () => {
    prisma.member.findUnique.mockResolvedValue({
      id: "member-2",
      emailAccountId: "email-account-2",
      organizationId: "org-1",
      role: "owner",
    } as any);
    prisma.member.findFirst.mockResolvedValue({
      role: "owner",
      emailAccountId: "email-account-1",
    } as any);

    const result = await updateMemberRoleAction({
      memberId: "member-2",
      role: "admin",
    });

    expect(result?.serverError).toBe(
      "Organization owners cannot be reassigned.",
    );
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});
