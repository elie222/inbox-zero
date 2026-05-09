import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  handleInvitationAction,
  inviteMembersAction,
} from "@/utils/actions/organization";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    AUTO_ENABLE_ORG_ANALYTICS: false,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "test@test.com" } })),
}));
vi.mock("@/env", async () => {
  const actual = await vi.importActual<typeof import("@/env")>("@/env");

  return {
    ...actual,
    env: {
      ...actual.env,
      get AUTO_ENABLE_ORG_ANALYTICS() {
        return mockEnv.AUTO_ENABLE_ORG_ANALYTICS;
      },
    },
  };
});

describe("createInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.AUTO_ENABLE_ORG_ANALYTICS = false;
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "test@test.com",
      account: { userId: "u1", provider: "google" },
    });
  });

  it("invites members using emailAccountId as inviterId and returns per-row results", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "ea_inviter",
      email: "inviter@test.com",
      name: "Inviter",
      account: { userId: "u1", provider: "google" },
    } as any);
    prisma.member.findFirst.mockResolvedValueOnce({
      organizationId: "org_1",
      emailAccountId: "ea_inviter",
      role: "owner",
    } as any); // caller membership
    prisma.invitation.findMany.mockResolvedValue([] as any); // no existing
    prisma.invitation.create
      .mockResolvedValueOnce({ id: "inv_1" } as any)
      .mockResolvedValueOnce({ id: "inv_2" } as any);
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme" } as any);

    const res = await inviteMembersAction({
      organizationId: "org_1",
      invitations: [
        { email: "user@test.com", role: "member" },
        { email: "second@test.com", role: "admin" },
      ],
    });

    expect(prisma.invitation.create).toHaveBeenCalledTimes(2);
    expect(prisma.invitation.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        email: "user@test.com",
        role: "member",
        organizationId: "org_1",
        inviterId: "ea_inviter",
      }),
      select: { id: true },
    });
    expect(prisma.invitation.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        email: "second@test.com",
        role: "admin",
        organizationId: "org_1",
      }),
      select: { id: true },
    });
    expect(res?.data).toEqual({
      results: [
        { email: "user@test.com", success: true },
        { email: "second@test.com", success: true },
      ],
    });
  });

  it("flags already-invited emails without creating duplicates", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "ea_inviter",
      email: "inviter@test.com",
      name: "Inviter",
      account: { userId: "u1", provider: "google" },
    } as any);
    prisma.member.findFirst.mockResolvedValueOnce({
      organizationId: "org_1",
      emailAccountId: "ea_inviter",
      role: "admin",
    } as any);
    prisma.invitation.findMany.mockResolvedValue([
      { email: "existing@test.com" },
    ] as any);
    prisma.invitation.create.mockResolvedValueOnce({ id: "inv_2" } as any);
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme" } as any);

    const res = await inviteMembersAction({
      organizationId: "org_1",
      invitations: [
        { email: "existing@test.com", role: "member" },
        { email: "fresh@test.com", role: "member" },
      ],
    });

    expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
    expect(res?.data).toEqual({
      results: [
        {
          email: "existing@test.com",
          success: false,
          error: "Already invited",
        },
        { email: "fresh@test.com", success: true },
      ],
    });
  });

  it("blocks non-owners from assigning the owner role", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "ea_inviter",
      email: "inviter@test.com",
      name: "Inviter",
      account: { userId: "u1", provider: "google" },
    } as any);
    prisma.member.findFirst.mockResolvedValueOnce({
      organizationId: "org_1",
      emailAccountId: "ea_inviter",
      role: "admin",
    } as any);
    prisma.invitation.findMany.mockResolvedValue([] as any);
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme" } as any);

    const res = await inviteMembersAction({
      organizationId: "org_1",
      invitations: [{ email: "boss@test.com", role: "owner" }],
    });

    expect(prisma.invitation.create).not.toHaveBeenCalled();
    expect(res?.data?.results[0]).toMatchObject({
      email: "boss@test.com",
      success: false,
    });
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
        allowOrgAdminAnalytics: false,
      }),
      select: { id: true },
    });
    expect(res?.data).toMatchObject({
      organizationId: "org_1",
    });
  });
});
