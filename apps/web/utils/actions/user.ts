"use server";

import { z } from "zod";
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { captureException, SafeError } from "@/utils/error";
import { updateAccountSeats } from "@/utils/premium/seats";
import { betterAuthConfig } from "@/utils/auth";
import { headers } from "next/headers";
import {
  saveAboutBody,
  saveSignatureBody,
  saveWritingStyleBody,
  updateAIDraftCleanupSettingsBody,
} from "@/utils/actions/user.validation";
import { clearLastEmailAccountCookie } from "@/utils/cookies.server";
import { aliasPosthogUser } from "@/utils/posthog";
import {
  cleanupAIDraftsForAccount,
  getConfiguredDraftCleanupDays,
} from "@/utils/ai/draft-cleanup";
import { isDuplicateError, isNotFoundError } from "@/utils/prisma-helpers";
import type { Logger } from "@/utils/logger";
import {
  DELETE_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR,
  DELETE_EMAIL_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR,
  getDeletableOrganizationIdsOrThrow,
  getDeletedAccountOwnershipImpact,
  getDeleteSoloOrganizationsOperation,
  getUserDeletionOwnershipImpact,
  isMemberEmailAccountForeignKeyError,
  isOrganizationOwnerInvariantError,
} from "@/utils/organizations/ownership";

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
    await assertUserAccountCanBeDeleted(userId);

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
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    const cleanupDays = await getConfiguredDraftCleanupDays(emailAccountId);
    return cleanupAIDraftsForAccount({
      emailAccountId,
      provider,
      logger,
      cleanupDays,
    });
  });

export const updateAIDraftCleanupSettingsAction = actionClient
  .metadata({ name: "updateAIDraftCleanupSettings" })
  .inputSchema(updateAIDraftCleanupSettingsBody)
  .action(async ({ parsedInput: { cleanupDays }, ctx: { emailAccountId } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { draftCleanupDays: cleanupDays },
    });

    return { cleanupDays };
  });

export const deleteEmailAccountAction = actionClientUser
  .metadata({ name: "deleteEmailAccount" })
  .inputSchema(z.object({ emailAccountId: z.string() }))
  .action(
    async ({
      ctx: { userId, userEmail, logger },
      parsedInput: { emailAccountId },
    }) => {
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
      const organizationIdsToDelete =
        await assertEmailAccountCanBeDeleted(emailAccountId);

      const isPrimaryAccount = emailAccount.email === emailAccount.user.email;
      const deleteSoloOrganizationsOperation =
        getDeleteSoloOrganizationsOperation(organizationIdsToDelete, [
          emailAccountId,
        ]);

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

        await runDeleteEmailAccountTransaction(
          userId,
          [
            deleteSoloOrganizationsOperation,
            prisma.user.update({
              where: {
                id: userId,
                email: oldEmail,
                emailAccounts: { some: { id: newPrimaryAccount.id } },
              },
              data: {
                email: newPrimaryAccount.email,
                name: newPrimaryAccount.name,
                image: newPrimaryAccount.image,
              },
            }),
            prisma.emailAccount.delete({
              where: {
                id: emailAccountId,
                userId,
                accountId: emailAccount.accountId,
              },
            }),
            prisma.account.delete({
              where: { id: emailAccount.accountId, userId },
            }),
          ],
          { emailAccountId, logger, userEmail },
        );

        // Alias the old PostHog identity to the new one
        after(async () => {
          await aliasPosthogUser({
            oldEmail,
            newEmail: newPrimaryAccount.email,
          });
        });
      } else {
        await runDeleteEmailAccountTransaction(
          userId,
          [
            deleteSoloOrganizationsOperation,
            prisma.emailAccount.delete({
              where: {
                id: emailAccountId,
                userId,
                accountId: emailAccount.accountId,
                user: { email: emailAccount.user.email },
              },
            }),
            prisma.account.delete({
              where: { id: emailAccount.accountId, userId },
            }),
          ],
          { emailAccountId, logger, userEmail },
        );
      }

      after(async () => {
        await updateAccountSeats({ userId });
      });
    },
  );

async function runDeleteEmailAccountTransaction(
  userId: string,
  operations: Prisma.PrismaPromise<unknown>[],
  context: {
    emailAccountId: string;
    logger: Logger;
    userEmail?: string | null;
  },
) {
  try {
    await prisma.$transaction([
      prisma.$queryRaw`
        SELECT true AS locked
        FROM (
          SELECT pg_advisory_xact_lock(539114481, hashtext(${userId}))
        ) lock
      `,
      ...operations,
    ]);
  } catch (error) {
    context.logger.error("Delete email account transaction failed", {
      error,
      emailAccountId: context.emailAccountId,
      prismaCode: getPrismaErrorCode(error),
      prismaMeta: getPrismaErrorMeta(error),
    });

    if (isNotFoundError(error)) {
      throw new SafeError("Email account already changed");
    }

    if (isDuplicateError(error, "email")) {
      throw new SafeError(
        "We couldn't make the remaining email account primary because that email is already in use.",
      );
    }

    if (
      isOrganizationOwnerInvariantError(error) ||
      isMemberEmailAccountForeignKeyError(error)
    ) {
      throw new SafeError(DELETE_EMAIL_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new SafeError(
        "We couldn't delete this email account because linked data still exists. Please contact support.",
      );
    }

    captureException(error, {
      userId,
      userEmail: context.userEmail ?? undefined,
      emailAccountId: context.emailAccountId,
      extra: { action: "deleteEmailAccount" },
    });

    throw new SafeError(
      "We couldn't delete this email account. Please contact support if this keeps happening.",
    );
  }
}

function getPrismaErrorCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

function getPrismaErrorMeta(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.meta
    : undefined;
}

async function assertEmailAccountCanBeDeleted(emailAccountId: string) {
  const ownershipImpact = await getDeletedAccountOwnershipImpact([
    emailAccountId,
  ]);

  return getDeletableOrganizationIdsOrThrow(
    ownershipImpact,
    DELETE_EMAIL_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR,
  );
}

async function assertUserAccountCanBeDeleted(userId: string) {
  const ownershipImpact = await getUserDeletionOwnershipImpact(userId);

  getDeletableOrganizationIdsOrThrow(
    ownershipImpact,
    DELETE_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR,
  );
}
