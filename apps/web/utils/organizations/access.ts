import prisma from "@/utils/prisma";
import { hasOrganizationAdminRole } from "./roles";

export async function checkOrgEmailAccountAccess(
  userId: string,
  emailAccountId: string,
) {
  const userMembership = await prisma.member.findFirst({
    where: { userId },
    select: {
      organizationId: true,
      role: true,
    },
  });

  if (!userMembership || !hasOrganizationAdminRole(userMembership.role)) {
    return null;
  }

  const targetEmailAccount = await prisma.emailAccount.findFirst({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      account: {
        select: {
          userId: true,
          provider: true,
        },
      },
      user: {
        select: {
          members: {
            where: {
              organizationId: userMembership.organizationId,
            },
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (targetEmailAccount && targetEmailAccount.user.members.length > 0) {
    return targetEmailAccount;
  }

  return null;
}
