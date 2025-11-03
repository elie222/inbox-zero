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

export const saveAboutAction = actionClient
  .metadata({ name: "saveAbout" })
  .schema(saveAboutBody)
  .action(async ({ parsedInput: { about }, ctx: { emailAccountId } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { about },
    });
  });

export const saveSignatureAction = actionClient
  .metadata({ name: "saveSignature" })
  .schema(saveSignatureBody)
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
  .action(async ({ ctx: { userId } }) => {
    await clearLastEmailAccountCookie().catch(() => {});

    await betterAuthConfig.api
      .signOut({
        headers: await headers(),
      })
      .catch(() => {});
    await deleteUser({ userId });
  });

export const deleteEmailAccountAction = actionClientUser
  .metadata({ name: "deleteEmailAccount" })
  .schema(z.object({ emailAccountId: z.string() }))
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

    if (emailAccount.email === emailAccount.user.email)
      throw new SafeError(
        "Cannot delete primary email account. Go to the Settings page to delete your entire account.",
      );

    await prisma.account.delete({
      where: { id: emailAccount.accountId, userId },
    });

    after(async () => {
      await updateAccountSeats({ userId });
    });
  });
