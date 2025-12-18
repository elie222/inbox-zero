import prisma from "@/utils/prisma";
import { transferPremiumDuringMerge } from "@/utils/user/merge-premium";
import type { Logger } from "@/utils/logger";

interface MergeAccountOptions {
  sourceAccountId: string;
  sourceUserId: string;
  targetUserId: string;
  email: string;
  name: string | null;
  logger: Logger;
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

  if (sourceUserEmailAccounts.length > 1) {
    logger.info(
      "Source user has multiple accounts, reassigning one and updating primary",
      {
        sourceUserId,
        emailAccountCount: sourceUserEmailAccounts.length,
      },
    );

    const accountBeingMoved = sourceUserEmailAccounts.find(
      (acc) => acc.accountId === sourceAccountId,
    );
    const isPrimaryAccount = accountBeingMoved?.email === sourceUser?.email;

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
        (acc) => acc.id !== accountBeingMoved?.id,
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
    return "partial_reassign";
  }

  await transferPremiumDuringMerge({
    sourceUserId,
    targetUserId,
    logger,
  });

  await prisma.$transaction([
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
      where: { id: sourceUserId },
    }),
  ]);

  return "full_merge";
}
