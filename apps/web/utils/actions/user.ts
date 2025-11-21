"use server";

import { z } from "zod";
import { after } from "next/server";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { updateAccountSeats } from "@/utils/premium/server";
import { betterAuthConfig } from "@/utils/auth";
import { headers } from "next/headers";
import {
  saveAboutBody,
  saveSignatureBody,
} from "@/utils/actions/user.validation";
import { clearLastEmailAccountCookie } from "@/utils/cookies.server";
import { aliasPosthogUser } from "@/utils/posthog";

export const saveAboutAction = actionClient
  .metadata({ name: "saveAbout" })
  .inputSchema(saveAboutBody)
  .action(async ({ parsedInput: { about }, ctx: { emailAccountId } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { about },
    });
  });

export const saveSignatureAction = actionClient
  .metadata({ name: "saveSignature" })
  .inputSchema(saveSignatureBody)
  .action(async ({ parsedInput: { signature }, ctx: { emailAccountId } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { signature },
    });
  });

export const resetAnalyticsAction = actionClient
  .metadata({ name: "resetAnalytics" })
  .action(async ({ ctx: { emailAccountId } }) => {
    await prisma.emailMessage.deleteMany({
      where: { emailAccountId },
    });
  });

export const deleteAccountAction = actionClientUser
  .metadata({ name: "deleteAccount" })
  .action(async ({ ctx: { userId, logger } }) => {
    await clearLastEmailAccountCookie().catch((error) => {
      logger.error("Failed to clear last email account cookie", { error });
    });

    await betterAuthConfig.api
      .signOut({
        headers: await headers(),
      })
      .catch((error) => {
        logger.error("Failed to sign out", { error });
      });
    await deleteUser({ userId });
  });

export const deleteEmailAccountAction = actionClientUser
  .metadata({ name: "deleteEmailAccount" })
  .inputSchema(z.object({ emailAccountId: z.string() }))
  .action(async ({ ctx: { userId }, parsedInput: { emailAccountId } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId, userId },
      select: {
        email: true,
        accountId: true,
        user: { select: { email: true } },
      },
    });

    if (!emailAccount) throw new SafeError("Email account not found");
    if (!emailAccount.accountId) throw new SafeError("Account id not found");

    const isPrimaryAccount = emailAccount.email === emailAccount.user.email;

    if (isPrimaryAccount) {
      // Check if there are other email accounts
      const otherEmailAccounts = await prisma.emailAccount.findMany({
        where: { userId, id: { not: emailAccountId } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      });

      if (otherEmailAccounts.length === 0) {
        throw new SafeError(
          "Cannot delete your only email account. Go to the Settings page to delete your entire account.",
        );
      }

      // Promote the next email account to primary
      const newPrimaryAccount = otherEmailAccounts[0];
      const oldEmail = emailAccount.user.email;

      await prisma.user.update({
        where: { id: userId },
        data: {
          email: newPrimaryAccount.email,
          name: newPrimaryAccount.name,
          image: newPrimaryAccount.image,
        },
      });

      // Alias the old PostHog identity to the new one
      after(async () => {
        await aliasPosthogUser({
          oldEmail,
          newEmail: newPrimaryAccount.email,
        });
      });
    }

    await prisma.account.delete({
      where: { id: emailAccount.accountId, userId },
    });

    after(async () => {
      await updateAccountSeats({ userId });
    });
  });
