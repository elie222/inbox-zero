import prisma from "@/utils/prisma";
import { getGmailClientFromAccount } from "@/utils/gmail/client";

export async function getSessionAndGmailClient({
  accountId,
}: {
  accountId: string;
}) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!account) return { error: "Email account not found" };

  const gmail = getGmailClientFromAccount(account);
  if (!gmail) return { error: "Failed to get Gmail" };
  return { gmail };
}
