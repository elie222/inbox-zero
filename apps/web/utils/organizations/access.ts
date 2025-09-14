import prisma from "@/utils/prisma";
import { hasOrganizationAdminRole } from "./roles";

export async function getMemberEmailAccount(
  callerUserId: string,
  targetEmailAccountId: string,
) {
  const callerMember = await prisma.member.findFirst({
    where: { userId: callerUserId },
    select: {
      organizationId: true,
      role: true,
    },
  });

  if (!callerMember || !hasOrganizationAdminRole(callerMember.role)) {
    return null;
  }

  const targetEmailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: targetEmailAccountId,
      user: {
        members: {
          some: {
            organizationId: callerMember.organizationId,
          },
        },
      },
    },
  });

  return targetEmailAccount;
}
