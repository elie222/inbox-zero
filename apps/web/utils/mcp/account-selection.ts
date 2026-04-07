import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

const mcpEmailAccountSelect = {
  id: true,
  email: true,
  name: true,
  account: { select: { provider: true } },
} satisfies Prisma.EmailAccountSelect;

export async function listMcpEmailAccounts(userId: string) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: mcpEmailAccountSelect,
    orderBy: { createdAt: "asc" },
  });

  return accounts.map((account) => ({
    id: account.id,
    email: account.email,
    name: account.name,
    provider: account.account.provider,
  }));
}

export async function resolveMcpEmailAccount({
  userId,
  emailAccountId,
  emailAddress,
}: {
  userId: string;
  emailAccountId?: string;
  emailAddress?: string;
}) {
  if (emailAccountId && emailAddress) {
    throw new Error("Provide either emailAccountId or emailAddress, not both.");
  }

  if (emailAccountId) {
    const account = await prisma.emailAccount.findFirst({
      where: { id: emailAccountId, userId },
      select: mcpEmailAccountSelect,
    });

    if (!account) {
      throw new Error("Email account not found for the authenticated user.");
    }

    return {
      id: account.id,
      email: account.email,
      name: account.name,
      provider: account.account.provider,
    };
  }

  if (emailAddress) {
    const account = await prisma.emailAccount.findFirst({
      where: { email: emailAddress, userId },
      select: mcpEmailAccountSelect,
    });

    if (!account) {
      throw new Error("Email account not found for the authenticated user.");
    }

    return {
      id: account.id,
      email: account.email,
      name: account.name,
      provider: account.account.provider,
    };
  }

  const account = await prisma.emailAccount.findFirst({
    where: { userId },
    select: mcpEmailAccountSelect,
    orderBy: { createdAt: "asc" },
  });

  if (!account) {
    throw new Error("No email accounts are linked to the authenticated user.");
  }

  return {
    id: account.id,
    email: account.email,
    name: account.name,
    provider: account.account.provider,
  };
}
