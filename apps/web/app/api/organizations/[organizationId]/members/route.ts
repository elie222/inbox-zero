import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";

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

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const result = await getOrganizationMembers({ organizationId });

    return NextResponse.json(result);
  },
);

async function getOrganizationMembers({
  organizationId,
}: {
  organizationId: string;
}) {
  const [members, pendingInvitations] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId },
      select: {
        id: true,
        role: true,
        createdAt: true,
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

  return { members, pendingInvitations };
}
