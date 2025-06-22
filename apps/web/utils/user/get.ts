import prisma from "@/utils/prisma";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Prisma } from "@prisma/client";

export type EmailAccountWithAIAndTokens = Prisma.EmailAccountGetPayload<{
  select: {
    id: true;
    userId: true;
    email: true;
    about: true;
    user: {
      select: {
        aiProvider: true;
        aiModel: true;
        aiApiKey: true;
      };
    };
    account: {
      select: {
        access_token: true;
        refresh_token: true;
        expires_at: true;
      };
    };
  };
}> & {
  tokens: {
    access_token: string | null;
    refresh_token: string | null;
    expires_at: number | null;
  };
};

export async function getEmailAccountWithAi({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<EmailAccountWithAI | null> {
  return prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
    },
  });
}

export async function getEmailAccountWithAiAndTokens({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<EmailAccountWithAIAndTokens | null> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
    },
  });

  if (!emailAccount) return null;

  return {
    ...emailAccount,
    tokens: emailAccount.account,
  };
}

export async function getWritingStyle({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const writingStyle = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { writingStyle: true },
  });

  return writingStyle?.writingStyle || null;
}
