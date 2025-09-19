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
                role: { in: ["admin", "owner"] },
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
          role: { in: ["admin", "owner"] },
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
