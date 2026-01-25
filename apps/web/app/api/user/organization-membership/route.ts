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
  const membership = await prisma.member.findFirst({
    where: { emailAccountId },
    select: {
      role: true,
      organizationId: true,
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
  });

  if (!membership) return null;

  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    isOwner: membership.role === "owner",
    memberCount: membership.organization._count.members,
    pendingInvitationCount: membership.organization._count.invitations,
  };
}
