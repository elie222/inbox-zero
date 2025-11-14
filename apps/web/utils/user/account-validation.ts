import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("user/account-validation");

/**
 * Check if an email account already exists for a different user
 * This is used during account creation to prevent duplicates
 */
export async function checkAccountAlreadyExists({
  email,
  currentUserId,
}: {
  email: string;
  currentUserId: string;
}): Promise<{ exists: boolean; existingUserId?: string }> {
  const existingEmailAccount = await prisma.emailAccount.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { userId: true, email: true },
  });

  if (existingEmailAccount && existingEmailAccount.userId !== currentUserId) {
    logger.warn("Account with this email already exists for a different user", {
      email,
      existingUserId: existingEmailAccount.userId,
      currentUserId,
    });

    return {
      exists: true,
      existingUserId: existingEmailAccount.userId,
    };
  }

  return { exists: false };
}
