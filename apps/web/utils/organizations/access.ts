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
  });

  return targetEmailAccount;
}
