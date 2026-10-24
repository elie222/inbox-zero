import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { EMAIL_ACCOUNT_ORDER_BY } from "@/utils/email-account-order";

const mcpEmailAccountSelect = {
  id: true,
  email: true,
  name: true,
  account: { select: { provider: true } },
} satisfies Prisma.EmailAccountSelect;

type McpEmailAccountRow = Prisma.EmailAccountGetPayload<{
  select: typeof mcpEmailAccountSelect;
}>;

function toMcpEmailAccount(account: McpEmailAccountRow) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    provider: account.account.provider,
  };
}

export async function listMcpEmailAccounts(userId: string) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: mcpEmailAccountSelect,
    orderBy: EMAIL_ACCOUNT_ORDER_BY,
  });

  return accounts.map(toMcpEmailAccount);
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

  const where = emailAccountId
    ? { id: emailAccountId, userId }
    : emailAddress
      ? { email: emailAddress, userId }
      : { userId };

  const account = await prisma.emailAccount.findFirst({
    where,
    select: mcpEmailAccountSelect,
    ...(!emailAccountId &&
      !emailAddress && { orderBy: EMAIL_ACCOUNT_ORDER_BY }),
  });

  if (!account) {
    throw new Error(
      emailAccountId || emailAddress
        ? "Email account not found for the authenticated user."
        : "No email accounts are linked to the authenticated user.",
    );
  }

  return toMcpEmailAccount(account);
}
