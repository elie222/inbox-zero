"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { updateAllAccountsSelectionBody } from "@/utils/actions/all-accounts.validation";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export const updateAllAccountsSelectionAction = actionClientUser
  .metadata({ name: "updateAllAccountsSelection" })
  .inputSchema(updateAllAccountsSelectionBody)
  .action(async ({ ctx: { userId }, parsedInput: { emailAccountIds } }) => {
    const emailAccounts = await prisma.emailAccount.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedAccountIds = new Set(
      emailAccounts.map((emailAccount) => emailAccount.id),
    );

    if (emailAccountIds.some((id) => !ownedAccountIds.has(id))) {
      throw new SafeError("Email account not found");
    }

    await prisma.$transaction([
      prisma.emailAccount.updateMany({
        where: { userId, id: { in: emailAccountIds } },
        data: { includeInAllAccounts: true },
      }),
      prisma.emailAccount.updateMany({
        where: { userId, id: { notIn: emailAccountIds } },
        data: { includeInAllAccounts: false },
      }),
    ]);
  });
