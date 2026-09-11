import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsMember } from "@/utils/organizations/access";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

export type OrganizationMembersResponse = Awaited<
  ReturnType<typeof getOrganizationMembers>
>;

export const GET = withAuth(
  "organizations/members",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    const membership = await fetchAndCheckIsMember({ organizationId, userId });

    const result = await getOrganizationMembers({
      organizationId,
      isAdmin: hasOrganizationAdminRole(membership.role),
    });

    return NextResponse.json(result);
  },
);

async function getOrganizationMembers({
  isAdmin,
  organizationId,
}: {
  isAdmin: boolean;
  organizationId: string;
}) {
  const [members, pendingInvitations] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        allowOrgAdminAnalytics: true,
        emailAccount: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            account: {
              select: {
                disconnectedAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invitation.findMany({
      where: {
        organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        inviter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  return {
    members: members.map((member) => ({
      ...member,
      emailAccount: {
        id: member.emailAccount.id,
        name: member.emailAccount.name,
        email: member.emailAccount.email,
        image: member.emailAccount.image,
        disconnectedAt: isAdmin
          ? member.emailAccount.account.disconnectedAt
          : null,
      },
    })),
    pendingInvitations,
  };
}
