import prisma from "@/utils/prisma";

/**
 * Gets the email account ID from the provided email or looks it up using the account ID
 * @param email Optional email address to look up
 * @param accountId Optional account ID (external provider ID) to look up
 * @param userId User ID to verify ownership
 * @returns The email account ID (cuid) or undefined if not found
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
      select: { id: true },
    });

    return emailAccount?.id;
  }

  if (!accountId) return undefined;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { accountId, userId },
    select: { id: true },
  });

  return emailAccount?.id;
}
