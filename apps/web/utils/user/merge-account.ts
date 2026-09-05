import prisma from "@/utils/prisma";
import { transferPremiumDuringMerge } from "@/utils/user/merge-premium";
import type { Logger } from "@/utils/logger";
import { invalidateAccountValidation } from "@/utils/redis/account-validation";

interface MergeAccountOptions {
  email: string;
  logger: Logger;
  name: string | null;
  sourceAccountId: string;
  sourceUserId: string;
  targetUserId: string;
}

export async function mergeAccount({
  sourceAccountId,
  sourceUserId,
  targetUserId,
  email,
  name,
  logger,
}: MergeAccountOptions): Promise<"full_merge" | "partial_reassign"> {
  const sourceUserEmailAccounts = await prisma.emailAccount.findMany({
    where: { userId: sourceUserId },
    select: { id: true, email: true, accountId: true },
    orderBy: { createdAt: "asc" },
  });

  const sourceUser = await prisma.user.findUnique({
    where: { id: sourceUserId },
    select: { email: true },
  });
  const accountBeingMoved = sourceUserEmailAccounts.find(
    (account) => account.accountId === sourceAccountId,
  );

  if (!accountBeingMoved) {
    throw new Error("Source email account not found");
  }

  if (sourceUserEmailAccounts.length > 1) {
    logger.info(
      "Source user has multiple accounts, reassigning one and updating primary",
      {
        sourceUserId,
        emailAccountCount: sourceUserEmailAccounts.length,
      },
    );

    const isPrimaryAccount = accountBeingMoved.email === sourceUser?.email;

    const accountUpdate = prisma.account.update({
      where: { id: sourceAccountId },
      data: { userId: targetUserId },
    });

    const emailAccountUpdate = prisma.emailAccount.update({
      where: { accountId: sourceAccountId },
      data: {
        userId: targetUserId,
        name,
        email,
      },
    });

    if (isPrimaryAccount) {
      const newPrimaryAccount = sourceUserEmailAccounts.find(
        (acc) => acc.id !== accountBeingMoved.id,
      );
      if (newPrimaryAccount) {
        const userUpdate = prisma.user.update({
          where: { id: sourceUserId },
          data: { email: newPrimaryAccount.email },
        });
        await prisma.$transaction([
          accountUpdate,
          emailAccountUpdate,
          userUpdate,
        ]);
      } else {
        await prisma.$transaction([accountUpdate, emailAccountUpdate]);
      }
    } else {
      await prisma.$transaction([accountUpdate, emailAccountUpdate]);
    }
    await invalidateAccountValidation({
      userId: sourceUserId,
      emailAccountId: accountBeingMoved.id,
    });
    return "partial_reassign";
  }

  await transferPremiumDuringMerge({
    sourceUserId,
    targetUserId,
    logger,
  });

  await prisma.$transaction([
    // Foreign-key checks for new links must finish before the deletion check,
    // or wait until this transaction has committed.
    prisma.$queryRaw`SELECT id FROM "User" WHERE id = ${sourceUserId} FOR UPDATE`,
    prisma.account.update({
      where: { id: sourceAccountId },
      data: { userId: targetUserId },
    }),
    prisma.emailAccount.update({
      where: { accountId: sourceAccountId },
      data: {
        userId: targetUserId,
        name,
        email,
      },
    }),
    prisma.user.delete({
      where: {
        id: sourceUserId,
        accounts: { none: {} },
        emailAccounts: { none: {} },
      },
    }),
  ]);

  await invalidateAccountValidation({
    userId: sourceUserId,
    emailAccountId: accountBeingMoved.id,
  });

  return "full_merge";
}
