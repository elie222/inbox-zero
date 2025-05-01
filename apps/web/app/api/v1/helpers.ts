import prisma from "@/utils/prisma";

/**
 * Gets the email account ID from the provided email or looks it up using the account ID
 * @param email Optional email address
 * @param accountId Account ID to look up the email if not provided
 * @returns The email account ID or undefined if not found
 */
export async function getEmailAccountId({
  email,
  accountId,
  userId,
}: {
  email?: string;
  accountId?: string;
  userId: string;
}): Promise<string | undefined> {
  if (email) {
    // check user owns email account
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email, userId },
      select: { email: true },
    });

    return emailAccount?.email;
  }

  if (!accountId) return undefined;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { accountId, userId },
    select: { email: true },
  });

  return emailAccount?.email;
}
