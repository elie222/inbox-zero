import { notFound } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

export async function checkUserOwnsEmailAccount({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) notFound();

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { id: true },
  });
  if (!emailAccount) notFound();
}

export function getOwnEmailAccount(data: GetEmailAccountsResponse | undefined) {
  return data?.emailAccounts?.find((account) => account.isPrimary);
}
