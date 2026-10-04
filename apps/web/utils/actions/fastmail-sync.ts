"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { enqueueFastmailSync } from "@/utils/fastmail/queue";
import { isFastmailProvider } from "@/utils/email/provider-types";
import prisma from "@/utils/prisma";

export const syncFastmailAction = actionClient
  .metadata({ name: "syncFastmail" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        email: true,
        account: { select: { provider: true } },
      },
    });

    if (!account) {
      throw new Error("Account not found");
    }

    if (!isFastmailProvider(account.account?.provider)) {
      throw new Error(
        "Sync is only available for Fastmail accounts. Gmail and Outlook use push notifications.",
      );
    }

    await enqueueFastmailSync(emailAccountId);
    return { success: true, status: "queued" };
  });
