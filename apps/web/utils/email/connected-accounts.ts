import prisma from "@/utils/prisma";

export async function getConnectedEmailAccounts({
  userId,
  accountId,
}: {
  userId: string;
  accountId?: string;
}) {
  const accounts = await prisma.emailAccount.findMany({
    where: {
      ...(accountId ? { id: accountId } : {}),
      userId,
      account: { disconnectedAt: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      account: {
        select: { provider: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return accounts.map((account) => ({
    id: account.id,
    email: account.email,
    name: account.name,
    image: account.image,
    provider: account.account.provider,
  }));
}
