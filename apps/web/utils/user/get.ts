import prisma from "@/utils/prisma";

export async function getAiUser({ id }: { id: string }) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });
}

export async function getAiUserWithTokens({ id }: { id: string }) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      accounts: {
        take: 1,
        select: {
          access_token: true,
          refresh_token: true,
        },
      },
    },
  });

  if (!user) return null;

  return {
    ...user,
    tokens: user?.accounts[0],
  };
}

export async function getWritingStyle(email: string) {
  const writingStyle = await prisma.emailAccount.findUnique({
    where: { email },
    select: { writingStyle: true },
  });

  return writingStyle?.writingStyle || null;
}
