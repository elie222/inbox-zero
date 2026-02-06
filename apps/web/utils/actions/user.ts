"use server";

import { z } from "zod";
import { after } from "next/server";
import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { deleteUser } from "@/utils/user/delete";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { updateAccountSeats } from "@/utils/premium/server";
import { betterAuthConfig } from "@/utils/auth";
import { headers } from "next/headers";
import {
  saveAboutBody,
  saveSignatureBody,
  saveWritingStyleBody,
} from "@/utils/actions/user.validation";
import { clearLastEmailAccountCookie } from "@/utils/cookies.server";
import { aliasPosthogUser } from "@/utils/posthog";
import { createEmailProvider } from "@/utils/email/provider";
import { calculateSimilarity } from "@/utils/similarity-score";

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

export const saveWritingStyleAction = actionClient
  .metadata({ name: "saveWritingStyle" })
  .inputSchema(saveWritingStyleBody)
  .action(
    async ({ parsedInput: { writingStyle }, ctx: { emailAccountId } }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { writingStyle },
      });
    },
  );

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
    await deleteUser({ userId, logger });
  });

export const cleanupAIDraftsAction = actionClient
  .metadata({ name: "cleanupAIDrafts" })
  .action(
    async ({ ctx: { emailAccountId, provider: providerName, logger } }) => {
      const STALE_DAYS = 3;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS);

      const staleDrafts = await prisma.executedAction.findMany({
        where: {
          executedRule: { emailAccountId },
          type: ActionType.DRAFT_EMAIL,
          draftId: { not: null },
          wasDraftSent: null,
          draftSendLog: null,
          createdAt: { lt: cutoffDate },
        },
        select: {
          id: true,
          draftId: true,
          content: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (staleDrafts.length === 0) {
        return {
          total: 0,
          deleted: 0,
          skippedModified: 0,
          alreadyGone: 0,
          errors: 0,
        };
      }

      const provider = await createEmailProvider({
        emailAccountId,
        provider: providerName,
        logger,
      });

      let deleted = 0;
      let skippedModified = 0;
      let alreadyGone = 0;
      let errors = 0;

      for (const action of staleDrafts) {
        if (!action.draftId) continue;

        try {
          const draftDetails = await provider.getDraft(action.draftId);

          if (!draftDetails?.textPlain && !draftDetails?.textHtml) {
            await prisma.executedAction.update({
              where: { id: action.id },
              data: { wasDraftSent: false },
            });
            alreadyGone++;
            continue;
          }

          const similarityScore = calculateSimilarity(
            action.content,
            draftDetails,
          );

          if (similarityScore !== 1.0) {
            skippedModified++;
            continue;
          }

          await provider.deleteDraft(action.draftId);
          await prisma.executedAction.update({
            where: { id: action.id },
            data: { wasDraftSent: false },
          });
          deleted++;
        } catch (error) {
          logger.error("Error cleaning up draft", {
            executedActionId: action.id,
            draftId: action.draftId,
            error,
          });
          errors++;
        }
      }

      logger.info("AI draft cleanup completed", {
        total: staleDrafts.length,
        deleted,
        skippedModified,
        alreadyGone,
        errors,
      });

      return {
        total: staleDrafts.length,
        deleted,
        skippedModified,
        alreadyGone,
        errors,
      };
    },
  );

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
