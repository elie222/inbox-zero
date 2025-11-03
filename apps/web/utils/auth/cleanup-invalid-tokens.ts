import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

/**
 * Cleans up invalid tokens when authentication fails permanently.
 * Used for:
 * - invalid_grant: User revoked access or tokens expired
 * - insufficientPermissions: User hasn't granted all required scopes
 */
export async function cleanupInvalidTokens({
  emailAccountId,
  reason,
  logger,
}: {
  emailAccountId: string;
  reason: "invalid_grant" | "insufficient_permissions";
  logger: Logger;
}) {
  logger.info("Cleaning up invalid tokens", { reason });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { accountId: true },
  });

  if (!emailAccount) {
    logger.warn("Email account not found");
    return;
  }

  await prisma.account.update({
    where: { id: emailAccount.accountId },
    data: {
      access_token: null,
      refresh_token: null,
      expires_at: null,
    },
  });

  logger.info("Tokens cleared - user must re-authenticate", { reason });
}
