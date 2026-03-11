import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetOrganizationMembershipResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/organization-membership",
  async (request) => {
    const { emailAccountId } = request.auth;

    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { email: true, name: true },
  });

  const [hasPendingInvitation, membership] = await Promise.all([
    emailAccount
      ? prisma.invitation.findFirst({
          where: {
            email: { equals: emailAccount.email, mode: "insensitive" },
            status: "pending",
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        })
      : null,
    prisma.member.findFirst({
      where: { emailAccountId },
      select: {
        role: true,
        organizationId: true,
        allowOrgAdminAnalytics: true,
        organization: {
          select: {
            name: true,
            _count: {
              select: {
                members: true,
                invitations: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!membership) {
    return {
      organizationId: null,
      organizationName: null,
      role: null,
      isOwner: false,
      memberCount: 0,
      pendingInvitationCount: 0,
      allowOrgAdminAnalytics: false,
      hasPendingInvitationToOrg: !!hasPendingInvitation,
      userName: emailAccount?.name ?? null,
    };
  }

  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    isOwner: membership.role === "owner",
    memberCount: membership.organization._count.members,
    pendingInvitationCount: membership.organization._count.invitations,
    allowOrgAdminAnalytics: membership.allowOrgAdminAnalytics,
    hasPendingInvitationToOrg: false,
    userName: emailAccount?.name ?? null,
  };
}
