"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import {
  reorderEmailAccountsBody,
  updateAllAccountsSelectionBody,
} from "@/utils/actions/all-accounts.validation";
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

/** Saves the account switcher order, which Control/⌘+1–9 also follow. */
export const reorderEmailAccountsAction = actionClientUser
  .metadata({ name: "reorderEmailAccounts" })
  .inputSchema(reorderEmailAccountsBody)
  .action(async ({ ctx: { userId }, parsedInput: { emailAccountIds } }) => {
    const emailAccounts = await prisma.emailAccount.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedAccountIds = new Set(
      emailAccounts.map((emailAccount) => emailAccount.id),
    );

    // A partial list would leave positions colliding with the ones it skipped.
    if (
      emailAccountIds.length !== ownedAccountIds.size ||
      emailAccountIds.some((id) => !ownedAccountIds.has(id))
    ) {
      throw new SafeError(
        "Your accounts changed. Refresh the page and try again.",
      );
    }

    await prisma.$transaction(
      emailAccountIds.map((id, sortOrder) =>
        prisma.emailAccount.updateMany({
          where: { id, userId },
          data: { sortOrder },
        }),
      ),
    );
  });
