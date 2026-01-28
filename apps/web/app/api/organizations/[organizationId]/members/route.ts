import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsMember } from "@/utils/organizations/access";
import { ADMIN_ROLES } from "@/utils/organizations/roles";

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

    const { role } = await fetchAndCheckIsMember({ organizationId, userId });
    const isAdmin = ADMIN_ROLES.includes(role);

    const result = await getOrganizationMembers({ organizationId, isAdmin });

    return NextResponse.json(result);
  },
);

async function getOrganizationMembers({
  organizationId,
  isAdmin,
}: {
  organizationId: string;
  isAdmin: boolean;
}) {
  const members = await prisma.member.findMany({
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
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const pendingInvitations = isAdmin
    ? await prisma.invitation.findMany({
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
      })
    : [];

  return { members, pendingInvitations };
}
