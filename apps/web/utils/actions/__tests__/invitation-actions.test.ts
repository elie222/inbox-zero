import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
vi.mock("@/utils/prisma");

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "test@test.com" } })),
}));

import { inviteMemberAction } from "@/utils/actions/invite-member";
import { handleInvitationAction } from "@/utils/actions/invitation";

describe("invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "test@test.com",
      account: { userId: "u1", provider: "google" },
    });
  });

  it("invites member using emailAccountId as inviterId and sends email", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "ea_inviter",
      email: "inviter@test.com",
      name: "Inviter",
      account: { userId: "u1", provider: "google" },
    } as any);
    prisma.member.findFirst.mockResolvedValueOnce({
      organizationId: "org_1",
      role: "owner",
    } as any); // caller membership
    prisma.invitation.findFirst.mockResolvedValue(null as any); // no existing
    prisma.invitation.create.mockResolvedValue({ id: "inv_1" } as any);
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme" } as any);

    const res = await inviteMemberAction({
      email: "user@test.com",
      role: "member",
      organizationId: "org_1",
    });

    expect(prisma.invitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: "member",
        organizationId: "org_1",
      }),
      select: { id: true },
    });
    expect(res?.data).toBeUndefined();
  });

  it("accepts invitation and creates member for recipient emailAccountId", async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: "inv_1",
      organizationId: "org_1",
      email: "user@test.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    } as any);
    prisma.emailAccount.findFirst.mockResolvedValue({ id: "ea_user" } as any);
    prisma.member.findFirst.mockResolvedValueOnce(null as any); // no existing membership
    prisma.member.create.mockResolvedValue({ id: "mem_1" } as any);
    prisma.invitation.update.mockResolvedValue({
      id: "inv_1",
      status: "accepted",
    } as any);

    const res = await handleInvitationAction({ invitationId: "inv_1" } as any);

    expect(prisma.member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailAccountId: "ea_user",
        organizationId: "org_1",
      }),
      select: { id: true },
    });
    expect(res?.data).toMatchObject({
      organizationId: "org_1",
    });
  });
});
