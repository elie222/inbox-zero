import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { isDraftUnmodified } from "@/utils/ai/choose-rule/draft-management";
import type { Logger } from "@/utils/logger";
import { DEFAULT_AI_DRAFT_CLEANUP_DAYS } from "@/utils/ai/draft-cleanup-settings";

export async function cleanupAIDraftsForAccount({
  emailAccountId,
  provider: providerName,
  logger,
  cleanupDays,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
  cleanupDays: number;
}) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - cleanupDays);

  const staleDrafts = await prisma.executedAction.findMany({
    where: {
      executedRule: { emailAccountId },
      type: ActionType.DRAFT_EMAIL,
      draftId: { not: null },
      OR: [{ draftSendLog: null }, { wasDraftSent: false }],
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
      cleanupDays,
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

      const isUnmodified = action.content
        ? isDraftUnmodified({
            originalContent: action.content,
            currentDraft: draftDetails,
            logger,
          })
        : false;

      if (!isUnmodified) {
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
    cleanupDays,
  };
}

export async function cleanupConfiguredAIDrafts({
  logger,
}: {
  logger: Logger;
}) {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      draftCleanupDays: { not: null },
      account: { disconnectedAt: null },
      executedRules: {
        some: {
          actionItems: {
            some: {
              type: ActionType.DRAFT_EMAIL,
              draftId: { not: null },
              OR: [{ draftSendLog: null }, { wasDraftSent: false }],
            },
          },
        },
      },
    },
    select: {
      id: true,
      draftCleanupDays: true,
      account: { select: { provider: true } },
    },
  });

  let total = 0;
  let deleted = 0;
  let skippedModified = 0;
  let alreadyGone = 0;
  let errors = 0;
  let failedAccounts = 0;

  for (const emailAccount of emailAccounts) {
    if (emailAccount.draftCleanupDays === null) continue;

    try {
      const result = await cleanupAIDraftsForAccount({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
        cleanupDays: emailAccount.draftCleanupDays,
      });

      total += result.total;
      deleted += result.deleted;
      skippedModified += result.skippedModified;
      alreadyGone += result.alreadyGone;
      errors += result.errors;
    } catch (error) {
      logger.error("Error cleaning up drafts for account", {
        emailAccountId: emailAccount.id,
        error,
      });
      failedAccounts++;
      errors++;
    }
  }

  return {
    accountsChecked: emailAccounts.length,
    failedAccounts,
    total,
    deleted,
    skippedModified,
    alreadyGone,
    errors,
  };
}

export async function getConfiguredDraftCleanupDays(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { draftCleanupDays: true },
  });

  return emailAccount?.draftCleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS;
}
