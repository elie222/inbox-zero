import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

export async function cleanupOrphanedAccount(
  orphanedAccountId: string,
  log: Logger,
) {
  const logger = log.with({ accountId: orphanedAccountId });

  const orphanedAccount = await prisma.account.findUnique({
    where: { id: orphanedAccountId },
    select: { id: true, userId: true, emailAccount: true },
  });

  if (!orphanedAccount) {
    logger.info("Account not found, may have been deleted already");
    return;
  }

  if (orphanedAccount.emailAccount) {
    logger.info("Account has an email account, skipping cleanup");
    return;
  }

  const userEmailAccountCount = await prisma.emailAccount.count({
    where: { userId: orphanedAccount.userId },
  });

  if (userEmailAccountCount === 0) {
    await prisma.$transaction([
      prisma.account.delete({ where: { id: orphanedAccount.id } }),
      prisma.user.delete({ where: { id: orphanedAccount.userId } }),
    ]);
    logger.info("Deleted orphaned Account and User");
  } else {
    await prisma.account.delete({ where: { id: orphanedAccount.id } });
    logger.info("Deleted orphaned Account, User has other accounts");
  }
}
