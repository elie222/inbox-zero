import prisma from "@/utils/prisma";
import type { UserEmailWithAI } from "@/utils/llms/types";

export async function getAiUser({
  email,
}: { email: string }): Promise<UserEmailWithAI | null> {
  return prisma.emailAccount.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });
}

export async function getAiUserWithTokens({ email }: { email: string }) {
  const user = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      account: {
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
    tokens: user?.account,
  };
}

export async function getWritingStyle(email: string) {
  const writingStyle = await prisma.emailAccount.findUnique({
    where: { email },
    select: { writingStyle: true },
  });

  return writingStyle?.writingStyle || null;
}
