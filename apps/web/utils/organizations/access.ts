import { SafeError } from "@/utils/error";
import {
  ADMIN_ROLES,
  hasOrganizationAdminRole,
} from "@/utils/organizations/roles";
import prisma from "@/utils/prisma";

export async function getMemberEmailAccount(
  callerEmailAccountId: string,
  targetEmailAccountId: string,
) {
  const targetEmailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: targetEmailAccountId,
      members: {
        some: {
          organization: {
            members: {
              some: {
                emailAccountId: callerEmailAccountId,
                role: { in: ADMIN_ROLES },
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return targetEmailAccount;
}

export async function getCallerEmailAccount(
  userId: string,
  targetEmailAccountId: string,
) {
  const callerEmailAccount = await prisma.emailAccount.findFirst({
    where: {
      userId,
      members: {
        some: {
          role: { in: ADMIN_ROLES },
          organization: {
            members: {
              some: {
                emailAccountId: targetEmailAccountId,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return callerEmailAccount;
}

export async function fetchAndCheckIsAdmin({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const member = await prisma.member.findFirst({
    where: {
      organizationId,
      emailAccount: { userId },
    },
    select: { role: true },
  });

  if (!member) {
    throw new SafeError("You are not a member of this organization");
  }

  if (!hasOrganizationAdminRole(member.role)) {
    throw new SafeError("You are not an organization admin");
  }
}
