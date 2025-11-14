import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("user/orphaned-account");

export async function cleanupOrphanedAccount(orphanedAccountId: string) {
  const orphanedAccount = await prisma.account.findUnique({
    where: { id: orphanedAccountId },
    select: { id: true, userId: true },
  });

  if (!orphanedAccount) return;

  const userEmailAccountCount = await prisma.emailAccount.count({
    where: { userId: orphanedAccount.userId },
  });

  if (userEmailAccountCount === 0) {
    await prisma.$transaction([
      prisma.account.delete({ where: { id: orphanedAccount.id } }),
      prisma.user.delete({ where: { id: orphanedAccount.userId } }),
    ]);
    logger.info("Deleted orphaned Account and User", {
      accountId: orphanedAccount.id,
      userId: orphanedAccount.userId,
    });
  } else {
    await prisma.account.delete({ where: { id: orphanedAccount.id } });
    logger.info("Deleted orphaned Account, User has other accounts", {
      accountId: orphanedAccount.id,
      userId: orphanedAccount.userId,
    });
  }
}
